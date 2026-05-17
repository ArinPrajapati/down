function safeParseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseBattleLineData(data) {
  return {
    roomId: data[0] || "",
    user1: data[1] || "",
    user2: data[2] || "",
  };
}

export function parseProtocolLine(line) {
  const raw = String(line ?? "");
  if (!raw) return { type: "empty", raw };

  if (!raw.startsWith("|")) return { type: "text", raw, text: raw };

  const parts = raw.split("|");
  const type = parts[1] || "";
  const data = parts.slice(2);

  if (type === "request") {
    const requestText = data.join("|");
    return {
      type,
      raw,
      requestText,
      request: safeParseJSON(requestText),
    };
  }

  if (type === "win") {
    return { type, raw, winner: data[0] || "" };
  }

  if (type === "tie") {
    return { type, raw };
  }

  if (type === "error") {
    return { type, raw, message: data.join("|") };
  }

  if (type === "updatesearch") {
    const payload = data.join("|");
    return {
      type,
      raw,
      payload,
      state: safeParseJSON(payload),
    };
  }

  if (type === "updatechallenges") {
    const payload = data.join("|");
    return {
      type,
      raw,
      payload,
      state: safeParseJSON(payload),
    };
  }

  if (type === "battle" || type === "b") {
    return {
      type: "battle",
      raw,
      ...parseBattleLineData(data),
    };
  }

  return { type, raw, data };
}
