export function parseRoomMessage(raw) {
  const text = String(raw ?? "");
  if (!text) return [];

  const blocks = text.split("\n\n");
  const parsed = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let roomId = "";
    let body = trimmed;

    if (trimmed.startsWith(">")) {
      const nlIndex = trimmed.indexOf("\n");
      if (nlIndex === -1) {
        roomId = trimmed.slice(1);
        body = "";
      } else {
        roomId = trimmed.slice(1, nlIndex);
        body = trimmed.slice(nlIndex + 1);
      }
    }

    const lines = body
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    if (!lines.length) continue;
    parsed.push({ roomId, lines, raw: block });
  }

  return parsed;
}
