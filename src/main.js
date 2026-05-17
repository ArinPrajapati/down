import "dotenv/config";
import { loadConfig } from "./config.js";
import { ShowdownClient, resolveWebSocketFactory } from "./showdownClient.js";
import { DecisionEngine } from "./decisionEngine.js";
import { BattleLoop } from "./battleLoop.js";

async function main() {
  const config = loadConfig();

  if (
    config.llm.provider === "codex" &&
    typeof config.llm.codex?.baseUrl === "string" &&
    config.llm.codex.baseUrl.includes("api.openai.com")
  ) {
    throw new Error(
      "Invalid Codex base URL for auth.json flow. Use https://chatgpt.com/backend-api/codex (set DOWN_CODEX_BASE_URL).",
    );
  }

  console.log("v0.start", {
    matchMode: config.showdown.matchMode,
    format: config.showdown.format,
    llmProvider: config.llm.provider,
    codexBaseUrl: config.llm.codex?.baseUrl ?? null,
  });

  const createWebSocket = await resolveWebSocketFactory();
  const client = new ShowdownClient(config.showdown);
  const decisionEngine = new DecisionEngine(config.llm);

  let battleResult = null;

  try {
    console.log("showdown.connect.start", config.showdown.websocketUrl);
    const session = await client.connectAndLogin(createWebSocket);
    console.log("showdown.login.ok", {
      challstr: session.challstr,
      assertionLength: session.assertion?.length ?? 0,
    });

    const battleLoop = new BattleLoop({
      client,
      config: {
        username: config.showdown.username,
        format: config.showdown.format,
        packedTeam: config.showdown.packedTeam,
        matchMode: config.showdown.matchMode,
        targetUsername: config.showdown.targetUsername,
        roomWaitTimeoutMs: config.showdown.roomWaitTimeoutMs,
      },
      decisionEngine,
    });

    battleResult = await battleLoop.runOneBattle();
    console.log("v0.done", battleResult);
  } finally {
    client.close();
  }

  return battleResult;
}

main().catch((error) => {
  console.error("v0.error", error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
