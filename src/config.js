import { DEFAULT_TEAM_EXPORT, DEFAULT_TEAM_PACKED, importExportedTeam, packTeam } from "./team.js";

function required(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, fallback = null) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return value;
}

export function loadConfig() {
  const matchMode = optional("DOWN_MATCH_MODE", "search");
  if (!["search", "challenge", "accept"].includes(matchMode)) {
    throw new Error("DOWN_MATCH_MODE must be one of: search, challenge, accept");
  }

  const targetUsername = optional("DOWN_TARGET_USERNAME", null);

  if ((matchMode === "challenge" || matchMode === "accept") && !targetUsername) {
    throw new Error("DOWN_TARGET_USERNAME is required when DOWN_MATCH_MODE is challenge or accept");
  }

  const provider = optional("DOWN_LLM_PROVIDER", "codex");
  if (!["mock", "codex", "openai"].includes(provider)) {
    throw new Error("DOWN_LLM_PROVIDER must be one of: mock, codex, openai");
  }

  const teamExport = optional("DOWN_TEAM_EXPORT", DEFAULT_TEAM_EXPORT);
  const packedTeamFromExport = packTeam(importExportedTeam(teamExport));
  const packedTeam = optional("DOWN_PACKED_TEAM", packedTeamFromExport || DEFAULT_TEAM_PACKED);

  return {
    showdown: {
      websocketUrl: optional("DOWN_SHOWDOWN_WS_URL", "wss://sim3.psim.us/showdown/websocket"),
      loginUrl: optional("DOWN_SHOWDOWN_LOGIN_URL", "https://play.pokemonshowdown.com/api/login"),
      username: required("DOWN_USERNAME", optional("DOWN_USERNAME", null)),
      password: required("DOWN_PASSWORD", optional("DOWN_PASSWORD", null)),
      format: optional("DOWN_FORMAT", "gen91v1"),
      packedTeam,
      matchMode,
      targetUsername,
      roomWaitTimeoutMs: Number(optional("DOWN_ROOM_WAIT_TIMEOUT_MS", "180000")),
    },
    llm: {
      provider,
      model: optional("DOWN_LLM_MODEL", "gpt-5.3-codex"),
      reasoningEffort: optional("DOWN_LLM_REASONING_EFFORT", "medium"),
      timeoutMs: Number(optional("DOWN_LLM_TIMEOUT_MS", "45000")),
      codex: {
        baseUrl: optional("DOWN_CODEX_BASE_URL", "https://chatgpt.com/backend-api/codex"),
      },
      openai: {
        apiKey: optional("DOWN_OPENAI_API_KEY", optional("OPENAI_API_KEY", null)),
        baseUrl: optional("DOWN_OPENAI_BASE_URL", "https://api.openai.com/v1/chat/completions"),
      },
    },
  };
}
