import { EventEmitter } from "node:events";
import {
  openAuthenticatedSession,
  sendGlobal,
  sendRoom,
} from "../lib/showdown/src/index.js";

function normalizeMessageData(data) {
  if (typeof data === "string") return data;
  if (data == null) return "";
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return String(data);
}

function adaptWebSocket(webSocket) {
  const emitter = new EventEmitter();

  webSocket.addEventListener("open", () => emitter.emit("open"));
  webSocket.addEventListener("close", (event) => emitter.emit("close", event));
  webSocket.addEventListener("error", (event) => {
    const error = event?.error instanceof Error ? event.error : new Error("WebSocket error");
    emitter.emit("error", error);
  });
  webSocket.addEventListener("message", (event) => {
    emitter.emit("message", normalizeMessageData(event?.data));
  });

  return {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    send(text) {
      webSocket.send(text);
    },
    close() {
      webSocket.close();
    },
  };
}

export async function resolveWebSocketFactory() {
  if (typeof globalThis.WebSocket === "function") {
    return (url) => adaptWebSocket(new globalThis.WebSocket(url));
  }

  try {
    const wsModule = await import("ws");
    const WS = wsModule.default ?? wsModule.WebSocket ?? wsModule;
    return (url) => new WS(url);
  } catch {
    throw new Error("No WebSocket runtime found. Use Node.js with global WebSocket support or install the `ws` package.");
  }
}

export class ShowdownClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
  }

  async connectAndLogin(createWebSocket) {
    const session = await openAuthenticatedSession({
      websocketUrl: this.config.websocketUrl,
      createWebSocket,
      username: this.config.username,
      password: this.config.password,
      loginUrl: this.config.loginUrl,
      fetchImpl: fetch,
    });

    this.socket = session.socket;
    return session;
  }

  assertConnected() {
    if (!this.socket) {
      throw new Error("Showdown socket is not connected");
    }
  }

  onMessage(handler) {
    this.assertConnected();
    this.socket.on("message", handler);
    return () => this.socket.off("message", handler);
  }

  sendRaw(text) {
    this.assertConnected();
    this.socket.send(text);
  }

  sendGlobal(text) {
    this.assertConnected();
    sendGlobal(this.socket, text);
  }

  sendRoom(roomId, text) {
    this.assertConnected();
    sendRoom(this.socket, roomId, text);
  }

  close() {
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
  }
}
