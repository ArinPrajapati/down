import { parseRoomMessage } from "./parseRoomMessage.js";

function onceOpen(socket, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("WebSocket open timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      socket.off?.("open", onOpen);
      socket.off?.("error", onError);
    }

    function onOpen() {
      cleanup();
      resolve();
    }

    function onError(err) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err ?? "Socket error")));
    }

    socket.on("open", onOpen);
    socket.on("error", onError);
  });
}

export function extractChallstrFromLine(line) {
  const match = String(line ?? "").match(/^\|challstr\|(.+)$/);
  return match ? match[1] : null;
}

export function waitForChallstr(socket, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for challstr"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      socket.off?.("message", onMessage);
      socket.off?.("close", onClose);
      socket.off?.("error", onError);
    }

    function onClose() {
      cleanup();
      reject(new Error("Socket closed before challstr"));
    }

    function onError(err) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err ?? "Socket error")));
    }

    function onMessage(buf) {
      const raw = typeof buf === "string" ? buf : buf.toString();
      const blocks = parseRoomMessage(raw);
      for (const block of blocks) {
        for (const line of block.lines) {
          const challstr = extractChallstrFromLine(line);
          if (!challstr) continue;
          cleanup();
          resolve(challstr);
          return;
        }
      }
    }

    socket.on("message", onMessage);
    socket.on("close", onClose);
    socket.on("error", onError);
  });
}

export function sendGlobal(socket, text) {
  socket.send(`|${text}`);
}

export function sendRoom(socket, roomId, text) {
  socket.send(`${roomId}|${text}`);
}

export function sendTrn(socket, username, assertion) {
  if (!username) throw new Error("username is required");
  if (!assertion) throw new Error("assertion is required");
  sendGlobal(socket, `/trn ${username},0,${assertion}`);
}

export async function connect({ websocketUrl, createWebSocket, openTimeoutMs = 15000 }) {
  if (!websocketUrl) throw new Error("websocketUrl is required");
  if (typeof createWebSocket !== "function") throw new Error("createWebSocket must be a function");

  const socket = createWebSocket(websocketUrl);
  await onceOpen(socket, openTimeoutMs);
  return socket;
}
