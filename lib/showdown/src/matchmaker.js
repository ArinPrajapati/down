import { buildSearchCommands, buildChallengeCommands } from "./buildCommands.js";

function requireSocket(socket) {
  if (!socket || typeof socket.send !== "function") {
    throw new Error("socket with send(text) is required");
  }
}

function resolveFormat(format, defaultFormat) {
  const finalFormat = format ?? defaultFormat;
  if (!finalFormat) throw new Error("format is required");
  return finalFormat;
}

export function createMatchmaker({ socket, defaultFormat = null, defaultPackedTeam = null } = {}) {
  requireSocket(socket);

  function sendCommands(commands) {
    for (const cmd of commands) socket.send(cmd);
    return commands;
  }

  return {
    search({ format, packedTeam = defaultPackedTeam } = {}) {
      const finalFormat = resolveFormat(format, defaultFormat);
      return sendCommands(buildSearchCommands({ format: finalFormat, packedTeam }));
    },

    challenge({ username, format, packedTeam = defaultPackedTeam } = {}) {
      const finalFormat = resolveFormat(format, defaultFormat);
      return sendCommands(buildChallengeCommands({ username, format: finalFormat, packedTeam }));
    },

    accept({ username, packedTeam = defaultPackedTeam } = {}) {
      if (!username) throw new Error("username is required");
      return sendCommands([`|/utm ${packedTeam ?? "null"}`, `|/accept ${username}`]);
    },

    reject({ username } = {}) {
      if (!username) throw new Error("username is required");
      return sendCommands([`|/reject ${username}`]);
    },

    cancelSearch() {
      return sendCommands(["|/cancelsearch"]);
    },

    cancelChallenge({ username } = {}) {
      if (!username) throw new Error("username is required");
      return sendCommands([`|/cancelchallenge ${username}`]);
    },
  };
}
