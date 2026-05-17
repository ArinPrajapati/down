function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractPayload(rawLine, expectedType) {
  const line = String(rawLine ?? "");
  const prefix = `|${expectedType}|`;
  if (line.startsWith(prefix)) {
    return line.slice(prefix.length);
  }
  return line;
}

export function parseUpdateSearch(rawLine) {
  const payload = extractPayload(rawLine, "updatesearch");
  const json = safeParseJSON(payload);
  if (!json) return null;

  const searching = Array.isArray(json.searching) ? json.searching : [];
  const games = json.games && typeof json.games === "object" ? json.games : {};

  return {
    searching,
    games,
  };
}

export function parseUpdateChallenges(rawLine) {
  const payload = extractPayload(rawLine, "updatechallenges");
  const json = safeParseJSON(payload);
  if (!json) return null;

  const challengesFrom = json.challengesFrom && typeof json.challengesFrom === "object" ? json.challengesFrom : {};
  const challengeTo = json.challengeTo && typeof json.challengeTo === "object" ? json.challengeTo : null;

  return {
    challengesFrom,
    challengeTo,
  };
}

export function detectBattleRoomIds(line) {
  const raw = String(line ?? "");
  const roomIds = new Set();

  if (raw.startsWith("|battle|")) {
    const parts = raw.split("|");
    if (parts[2]) roomIds.add(parts[2]);
  }

  if (raw.startsWith("|updatesearch|")) {
    const parsed = parseUpdateSearch(raw);
    if (parsed) {
      for (const roomId of Object.keys(parsed.games)) {
        if (roomId.startsWith("battle-")) roomIds.add(roomId);
      }
    }
  }

  return [...roomIds];
}

export function buildChooseRoomCommand({ roomId, compiledChoice }) {
  if (!roomId) throw new Error("roomId is required");
  if (!compiledChoice) throw new Error("compiledChoice is required");
  return `${roomId}|/choose ${compiledChoice}`;
}

