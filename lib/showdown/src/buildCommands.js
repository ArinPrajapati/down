export function buildSearchCommands({ format, packedTeam }) {
  if (!format) throw new Error("format is required");

  const commands = [];
  commands.push(`|/utm ${packedTeam ?? "null"}`);
  commands.push(`|/search ${format}`);
  return commands;
}

export function buildChallengeCommands({ username, format, packedTeam }) {
  if (!username) throw new Error("username is required");
  if (!format) throw new Error("format is required");

  const commands = [];
  commands.push(`|/utm ${packedTeam ?? "null"}`);
  commands.push(`|/challenge ${username}, ${format}`);
  return commands;
}

export function extractBattleResult(lines) {
  for (const line of lines || []) {
    if (line.startsWith("|win|")) {
      return { done: true, type: "win", winner: line.split("|")[2] || "" };
    }
    if (line === "|tie") {
      return { done: true, type: "tie", winner: null };
    }
  }
  return { done: false, type: null, winner: null };
}
