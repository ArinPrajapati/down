import {
  parseRoomMessage,
  parseProtocolLine,
  parseBattleRequest,
  compileChoice,
  createMatchmaker,
  parseUpdateChallenges,
  detectBattleRoomIds,
  buildChooseRoomCommand,
} from "../lib/showdown/src/index.js";

function isBattleRoomId(value) {
  return typeof value === "string" && value.startsWith("battle-");
}

function baseBattleRoomId(roomId) {
  if (!isBattleRoomId(roomId)) return null;
  const parts = roomId.split("-");
  if (parts.length < 4) return roomId;
  return parts.slice(0, 3).join("-");
}

function sameBattleRoom(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const baseA = baseBattleRoomId(a);
  const baseB = baseBattleRoomId(b);
  return Boolean(baseA && baseB && baseA === baseB);
}

function battleResultFromEvent(event, username) {
  if (event.type === "win") {
    const winner = String(event.winner ?? "");
    return {
      done: true,
      result: winner.toLowerCase() === String(username).toLowerCase() ? "win" : "loss",
      winner,
    };
  }

  if (event.type === "tie") {
    return {
      done: true,
      result: "tie",
      winner: null,
    };
  }

  return { done: false, result: null, winner: null };
}

function lineMessage(event) {
  if (!event) return "";
  if (typeof event.message === "string" && event.message) return event.message;
  if (Array.isArray(event.data) && event.data.length > 0) return event.data.join("|");
  if (typeof event.raw === "string") return event.raw;
  return "";
}

export class BattleLoop {
  constructor({ client, config, decisionEngine }) {
    this.client = client;
    this.config = config;
    this.decisionEngine = decisionEngine;

    this.battleRoomId = null;
    this.acceptedChallenge = false;
    this.processing = Promise.resolve();
  }

  beginMatchmaking() {
    const matchmaker = createMatchmaker({
      socket: { send: (text) => this.client.sendRaw(text) },
      defaultFormat: this.config.format,
      defaultPackedTeam: this.config.packedTeam,
    });

    if (this.config.matchMode === "search") {
      const sent = matchmaker.search();
      console.log("matchmaking.search", sent);
      return;
    }

    if (this.config.matchMode === "challenge") {
      const sent = matchmaker.challenge({ username: this.config.targetUsername });
      console.log("matchmaking.challenge", sent);
      return;
    }

    if (this.config.matchMode === "accept") {
      console.log("matchmaking.accept.waiting", { from: this.config.targetUsername });
      return;
    }

    throw new Error(`Unsupported match mode: ${this.config.matchMode}`);
  }

  maybeAcceptChallenge(line) {
    if (this.config.matchMode !== "accept" || this.acceptedChallenge) return;

    const state = parseUpdateChallenges(line);
    if (!state) return;

    const challengers = Object.keys(state.challengesFrom ?? {});
    if (challengers.length === 0) return;

    const target = this.config.targetUsername
      ? challengers.find((name) => name.toLowerCase() === this.config.targetUsername.toLowerCase())
      : challengers[0];

    if (!target) return;

    const format = state.challengesFrom[target];
    if (format !== this.config.format) {
      console.log("matchmaking.accept.skip-format", { target, format, expected: this.config.format });
      return;
    }

    this.client.sendRaw(`|/utm ${this.config.packedTeam ?? "null"}`);
    this.client.sendRaw(`|/accept ${target}`);
    this.acceptedChallenge = true;
    console.log("matchmaking.accept.sent", { target, format });
  }

  maybeSetBattleRoom(block, line) {
    if (this.battleRoomId && block.roomId && sameBattleRoom(this.battleRoomId, block.roomId)) {
      if (this.battleRoomId !== block.roomId) {
        this.battleRoomId = block.roomId;
        console.log("battle.room.updated", this.battleRoomId);
      }
      return;
    }

    if (!this.battleRoomId && isBattleRoomId(block.roomId)) {
      this.battleRoomId = block.roomId;
      console.log("battle.room.detected", this.battleRoomId);
      return;
    }

    if (this.battleRoomId) return;

    const ids = detectBattleRoomIds(line).filter(isBattleRoomId);
    if (ids.length > 0) {
      // Prefer the longest id: updatesearch can first expose a short id and later a full id.
      ids.sort((a, b) => b.length - a.length);
      this.battleRoomId = ids[0];
      console.log("battle.room.detected", this.battleRoomId);
    }
  }

  async handleRequest(roomId, requestEvent) {
    const parsedRequest = parseBattleRequest(requestEvent.request);
    console.log("battle.request", {
      roomId,
      kind: parsedRequest.kind,
      rqid: parsedRequest.rqid,
    });

    if (parsedRequest.kind === "wait") {
      return;
    }

    const decisionResult = await this.decisionEngine.decide(parsedRequest);
    if (decisionResult.prompt) {
      console.log("llm.prompt.sent", {
        requestKind: parsedRequest.kind,
        provider: this.decisionEngine.config.provider,
      });
    }

    if (decisionResult.rawResponse) {
      console.log("llm.response.raw", decisionResult.rawResponse);
    }

    console.log("llm.decision.meta", {
      fallback: Boolean(decisionResult.fallback),
      error: decisionResult.error ?? null,
    });
    console.log("llm.decision", decisionResult.decision);

    let commandLine;
    if (decisionResult.decision.kind === "default") {
      commandLine = `${roomId}|/choose default`;
    } else {
      const compiledChoice = compileChoice(decisionResult.decision, parsedRequest);
      commandLine = buildChooseRoomCommand({
        roomId,
        compiledChoice,
      });
    }

    console.log("battle.choose.send", commandLine);
    this.client.sendRaw(commandLine);
  }

  async runOneBattle() {
    this.beginMatchmaking();

    return new Promise((resolve, reject) => {
      let done = false;
      let messageCount = 0;
      let waitingTicks = 0;
      let roomTimeoutArmed = true;

      const finalize = (value, error) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        clearInterval(waitingInterval);
        unsubscribe();
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      };

      const timeout = setTimeout(() => {
        if (!roomTimeoutArmed) return;
        finalize(null, new Error(`Timed out waiting for a battle room after ${this.config.roomWaitTimeoutMs}ms`));
      }, this.config.roomWaitTimeoutMs);

      const waitingInterval = setInterval(() => {
        if (this.battleRoomId) return;
        waitingTicks += 1;
        console.log("matchmaking.waiting", {
          seconds: waitingTicks * 15,
          mode: this.config.matchMode,
          format: this.config.format,
        });
      }, 15000);

      const unsubscribe = this.client.onMessage((raw) => {
        const blocks = parseRoomMessage(raw);

        for (const block of blocks) {
          for (const line of block.lines) {
            console.log("server.raw", {
              roomId: block.roomId || "",
              line,
            });
            messageCount += 1;
            this.maybeAcceptChallenge(line);
            this.maybeSetBattleRoom(block, line);

            if (this.battleRoomId && roomTimeoutArmed) {
              roomTimeoutArmed = false;
              clearTimeout(timeout);
              console.log("battle.room.timeout.disabled", this.battleRoomId);
            }

            const event = parseProtocolLine(line);

            if (!this.battleRoomId) {
              if (event.type === "updatesearch") {
                const searching = Array.isArray(event.state?.searching) ? event.state.searching : [];
                const games = event.state?.games && typeof event.state.games === "object" ? Object.keys(event.state.games) : [];
                console.log("matchmaking.updatesearch", { searching, games });
              } else if (event.type === "updatechallenges") {
                const from = Object.keys(event.state?.challengesFrom || {});
                const to = event.state?.challengeTo || null;
                console.log("matchmaking.updatechallenges", { from, to });
              } else if (event.type === "popup" || event.type === "error") {
                const message = lineMessage(event);
                console.log("matchmaking.server-message", message);

                const lowered = message.toLowerCase();
                if (
                  lowered.includes("invalid team") ||
                  lowered.includes("your team") && lowered.includes("not legal") ||
                  lowered.includes("format") && lowered.includes("not found") ||
                  lowered.includes("is banned") ||
                  lowered.includes("can't search")
                ) {
                  finalize(null, new Error(`Matchmaking rejected by server: ${message}`));
                  return;
                }
              } else if (messageCount <= 5) {
                // Surface a small sample early so we can confirm protocol traffic is being read.
                console.log("matchmaking.protocol.sample", line);
              }
            }

            if (!this.battleRoomId || !sameBattleRoom(block.roomId, this.battleRoomId)) {
              continue;
            }

            const end = battleResultFromEvent(event, this.config.username);
            if (end.done) {
              console.log("battle.result", end);
              finalize(end, null);
              return;
            }

            if (event.type === "error") {
              console.log("battle.protocol.error", event.message);
              continue;
            }

            if (event.type === "request") {
              this.processing = this.processing
                .then(() => this.handleRequest(this.battleRoomId, event))
                .catch((error) => {
                  console.log("battle.request.error", error instanceof Error ? error.message : String(error));
                  this.client.sendRaw(`${this.battleRoomId}|/choose default`);
                });
            }
          }
        }
      });
    });
  }
}
