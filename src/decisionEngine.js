import { validateChoice } from "../lib/showdown/src/index.js";
import { renderDecisionPrompt, renderRetryPrompt } from "./prompt.js";
import LLM from "../lib/llm.js/dist/index.mjs";

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function formatProviderError(error) {
  if (error == null) return "unknown provider error";
  const message = error instanceof Error ? error.message : String(error);
  const status = error?.status ?? error?.response?.status ?? error?.cause?.status;
  const statusText = error?.statusText ?? error?.response?.statusText ?? error?.cause?.statusText;
  const body = error?.body ?? error?.response?.body ?? error?.cause?.body;
  const causeMessage = error?.cause?.message;

  const parts = [message];
  if (status) {
    parts.push(`status=${status}${statusText ? ` ${statusText}` : ""}`);
  }
  if (causeMessage && causeMessage !== message) {
    parts.push(`cause=${causeMessage}`);
  }
  if (body) {
    const bodyText = typeof body === "string" ? body : JSON.stringify(body);
    parts.push(`body=${bodyText.slice(0, 1200)}`);
  }
  return parts.join(" | ");
}

function extractJSONObject(text) {
  const source = String(text ?? "").trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch {
    // Try to recover from wrapped output (for example markdown fences or extra text).
  }

  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const slice = source.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function targetForMove(moveTargetType) {
  if (moveTargetType === "normal") return "-1";
  if (moveTargetType === "adjacentAlly") return "+1";
  if (moveTargetType === "adjacentAllyOrSelf") return "+1";
  return null;
}

function isDoublesLikeRequest(request) {
  return Array.isArray(request?.requiredMoveSlots) && request.requiredMoveSlots.length > 1;
}

function pickFirstLegalDecision(request) {
  if (request.kind === "wait") {
    return { kind: "wait" };
  }

  if (request.kind === "teamPreview") {
    const teamOrder = (request.side?.pokemon ?? []).map((p) => p.slot);
    if (teamOrder.length === 0) return { kind: "default", reason: "no team preview options" };
    return { kind: "teamPreview", teamOrder, reason: "first legal order" };
  }

  if (request.kind === "forceSwitch") {
    const actions = [];
    const usedSwitches = new Set();

    for (const slot of request.requiredSwitchSlots) {
      const switchSlot = request.legalSwitches.find((candidate) => !usedSwitches.has(candidate));
      if (!switchSlot) {
        return { kind: "default", reason: "no legal force switch" };
      }
      usedSwitches.add(switchSlot);
      actions.push({ slot, type: "switch", switchSlot });
    }

    return { kind: "forceSwitch", actions, reason: "first legal switch" };
  }

  if (request.kind === "move") {
    const actions = [];
    const doublesLike = isDoublesLikeRequest(request);
    for (const slot of request.requiredMoveSlots) {
      const active = request.active.find((a) => a.slot === slot);
      if (!active) return { kind: "default", reason: "missing active slot" };

      const moveIndex = active.legalMoves[0];
      if (!moveIndex) {
        if (request.legalSwitches.length > 0) {
          actions.push({ slot, type: "switch", switchSlot: request.legalSwitches[0] });
          continue;
        }
        return { kind: "default", reason: "no legal move or switch" };
      }

      const move = active.moves.find((m) => m.moveIndex === moveIndex);
      const target = doublesLike ? targetForMove(move?.target ?? null) : null;
      actions.push({ slot, type: "move", moveIndex, target });
    }
    return { kind: "move", actions, reason: "first legal move" };
  }

  return { kind: "default", reason: "unsupported request kind" };
}

function normalizeActions(rawActions) {
  if (!Array.isArray(rawActions)) return [];

  return rawActions
    .map((action) => {
      if (!action || typeof action !== "object") return null;

      const slot = Number(action.slot);
      const target = action.target == null ? null : String(action.target);

      if (action.move != null) {
        return {
          slot,
          type: "move",
          moveIndex: Number(action.move),
          target,
          mega: Boolean(action.mega),
          zmove: Boolean(action.zmove),
          max: Boolean(action.max),
          tera: Boolean(action.tera),
        };
      }

      if (action.pokemon != null) {
        return {
          slot,
          type: "switch",
          switchSlot: Number(action.pokemon),
        };
      }

      if (action.type === "pass") {
        return {
          slot,
          type: "pass",
        };
      }

      if (action.type === "move" && action.moveIndex != null) {
        return {
          slot,
          type: "move",
          moveIndex: Number(action.moveIndex),
          target,
          mega: Boolean(action.mega),
          zmove: Boolean(action.zmove),
          max: Boolean(action.max),
          tera: Boolean(action.tera),
        };
      }

      if (action.type === "switch" && action.switchSlot != null) {
        return {
          slot,
          type: "switch",
          switchSlot: Number(action.switchSlot),
        };
      }

      return null;
    })
    .filter(Boolean);
}

function sanitizeDecisionForRequest(decision, request) {
  if (!decision || !Array.isArray(decision.actions)) return decision;
  if (request.kind !== "move") return decision;
  if (isDoublesLikeRequest(request)) return decision;

  return {
    ...decision,
    actions: decision.actions.map((action) => {
      if (!action || action.type !== "move") return action;
      return {
        ...action,
        target: null,
      };
    }),
  };
}

function mapLLMJsonToDecision(json, request) {
  if (!json || typeof json !== "object") {
    throw new Error("model response is not a JSON object");
  }

  const type = String(json.type ?? "").trim();

  if (type === "default") {
    return { kind: "default", reason: String(json.reason ?? "fallback") };
  }

  if (request.kind === "teamPreview") {
    if (type !== "teamPreview") {
      throw new Error(`expected type \"teamPreview\" for team preview request, received \"${type || "(empty)"}\"`);
    }
    if (!Array.isArray(json.order)) {
      throw new Error("teamPreview response must include order array");
    }
    return {
      kind: "teamPreview",
      teamOrder: json.order.map((value) => Number(value)),
      reason: String(json.reason ?? ""),
    };
  }

  if (request.kind === "forceSwitch") {
    if (type !== "switch") {
      throw new Error(`expected type \"switch\" for forceSwitch request, received \"${type || "(empty)"}\"`);
    }
    return {
      kind: "forceSwitch",
      actions: normalizeActions(json.actions),
      reason: String(json.reason ?? ""),
    };
  }

  if (request.kind === "move") {
    if (type !== "move" && type !== "switch") {
      throw new Error(`expected type \"move\" or \"switch\" for move request, received \"${type || "(empty)"}\"`);
    }
    return {
      kind: "move",
      actions: normalizeActions(json.actions),
      reason: String(json.reason ?? ""),
    };
  }

  throw new Error(`unsupported request kind: ${request.kind}`);
}

export class DecisionEngine {
  constructor(config) {
    this.config = config;
    this.codexClient = null;
  }

  extractResponseText(data) {
    if (typeof data?.output_text === "string" && data.output_text.length > 0) {
      return data.output_text;
    }

    if (!Array.isArray(data?.output)) return "";

    const textParts = [];
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const content of item.content) {
        if (content?.type === "output_text" && typeof content.text === "string") {
          textParts.push(content.text);
        }
      }
    }
    return textParts.join("\n");
  }

  async runOpenAIChatProvider({ baseUrl, apiKey, prompt }) {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI-compatible chat request failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }

  async runCodexProvider(prompt) {
    if (!this.codexClient) {
      this.codexClient = new LLM.Codex({
        model: this.config.model,
        baseUrl: this.config.codex?.baseUrl,
      });
    }
    this.codexClient.model = this.config.model;
    let response;
    try {
      response = await this.codexClient.chat(prompt, {
        stream: false,
        think: true,
        reasoning: { effort: this.config.reasoningEffort ?? "medium", summary: "detailed" },
      });
    } catch (error) {
      const details = {
        message: error?.message || String(error),
        name: error?.name || null,
        status: error?.status ?? error?.response?.status ?? error?.cause?.status ?? null,
        statusText: error?.statusText ?? error?.response?.statusText ?? error?.cause?.statusText ?? null,
        code: error?.code ?? error?.cause?.code ?? null,
        body: error?.body ?? error?.response?.body ?? error?.cause?.body ?? null,
        causeMessage: error?.cause?.message ?? null,
      };
      throw new Error(`Codex chat failed: ${JSON.stringify(details)}`);
    }
    if (typeof response === "string") return response;
    if (response?.thinking) {
      const preview = String(response.thinking).slice(0, 500);
      console.log("llm.thinking.preview", preview);
    }
    return response?.content ?? "";
  }

  async runProvider(prompt) {
    if (this.config.provider === "mock") {
      return '{"type":"default","reason":"mock provider"}';
    }

    if (this.config.provider === "codex") {
      return this.runCodexProvider(prompt);
    }

    if (this.config.provider === "openai") {
      const apiKey = this.config.openai?.apiKey;
      if (!apiKey) {
        throw new Error("Missing API key for openai provider. Set DOWN_OPENAI_API_KEY or OPENAI_API_KEY.");
      }

      return this.runOpenAIChatProvider({
        baseUrl: this.config.openai.baseUrl,
        apiKey,
        prompt,
      });
    }

    throw new Error(`Unsupported provider: ${this.config.provider}`);
  }

  async requestModel(prompt) {
    const timeoutMs = Number(this.config.timeoutMs ?? 20000);
    try {
      return await withTimeout(this.runProvider(prompt), timeoutMs, "LLM request");
    } catch (error) {
      const details = formatProviderError(error);
      // Retry once for transient transport/provider failures before falling back.
      const transient =
        details.includes("Failed to send request") ||
        details.includes("fetch failed") ||
        details.includes("timed out") ||
        details.includes("ECONNRESET") ||
        details.includes("EAI_AGAIN") ||
        details.includes("429") ||
        details.includes("503");

      if (!transient) throw new Error(details);

      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        return await withTimeout(this.runProvider(prompt), timeoutMs, "LLM request retry");
      } catch (retryError) {
        throw new Error(formatProviderError(retryError));
      }
    }
  }

  async decide(request) {
    const fallback = pickFirstLegalDecision(request);

    if (this.config.provider === "mock") {
      return {
        decision: fallback,
        prompt: "",
        rawResponse: "",
        fallback: false,
      };
    }

    const prompt = renderDecisionPrompt(request);
    let previousError = "";
    let previousResponse = "";

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const currentPrompt = attempt === 1
        ? prompt
        : renderRetryPrompt(prompt, previousResponse, previousError || "invalid output");

      try {
        const rawResponse = await this.requestModel(currentPrompt);
        previousResponse = String(rawResponse ?? "");

        const json = extractJSONObject(previousResponse);
        if (!json) {
          throw new Error("could not parse JSON object from model response");
        }

        const mapped = mapLLMJsonToDecision(json, request);
        const sanitized = sanitizeDecisionForRequest(mapped, request);
        if (sanitized.kind === "default") {
          return {
            decision: sanitized,
            prompt: currentPrompt,
            rawResponse: previousResponse,
            fallback: false,
          };
        }

        const valid = validateChoice(sanitized, request);
        if (!valid.ok) {
          throw new Error(valid.error);
        }

        return {
          decision: sanitized,
          prompt: currentPrompt,
          rawResponse: previousResponse,
          fallback: false,
        };
      } catch (error) {
        previousError = formatProviderError(error);
      }
    }

    return {
      decision: fallback,
      prompt,
      rawResponse: previousResponse,
      fallback: true,
      error: previousError,
    };
  }
}
