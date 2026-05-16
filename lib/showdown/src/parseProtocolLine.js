function safeParseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

  return { type, raw, data };
}
