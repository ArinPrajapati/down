import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  connect,
  waitForChallstr,
  sendGlobal,
  sendRoom,
  sendTrn,
  extractChallstrFromLine,
  loginWithPassword,
  parseLoginResponse,
  openAuthenticatedSession,
} from "../src/index.js";

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
  }

  send(text) {
    this.sent.push(text);
  }
}

test("extractChallstrFromLine parses challstr line", () => {
  const challstr = extractChallstrFromLine("|challstr|4|abcdef");
  assert.equal(challstr, "4|abcdef");
});

test("connect resolves on open", async () => {
  const socket = new FakeSocket();

  const connectPromise = connect({
    websocketUrl: "wss://sim3.psim.us/showdown/websocket",
    createWebSocket: () => socket,
  });

  socket.emit("open");
  const result = await connectPromise;
  assert.equal(result, socket);
});

test("waitForChallstr resolves from incoming message", async () => {
  const socket = new FakeSocket();
  const waitPromise = waitForChallstr(socket, 500);

  socket.emit("message", ">lobby\n|challstr|5|xyz");

  const challstr = await waitPromise;
  assert.equal(challstr, "5|xyz");
});

test("send helpers format commands correctly", () => {
  const socket = new FakeSocket();

  sendGlobal(socket, "/join lobby");
  sendRoom(socket, "battle-gen91v1-1", "/choose move 1");
  sendTrn(socket, "BotName", "ASSERT");

  assert.deepEqual(socket.sent, [
    "|/join lobby",
    "battle-gen91v1-1|/choose move 1",
    "|/trn BotName,0,ASSERT",
  ]);
});

test("parseLoginResponse supports leading bracket", () => {
  const assertion = parseLoginResponse(']{"assertion":"TOKEN"}');
  assert.equal(assertion, "TOKEN");
});

test("loginWithPassword posts form and returns assertion", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return {
      text: async () => ']{"assertion":"A1"}',
    };
  };

  const assertion = await loginWithPassword({
    username: "bot",
    password: "pass",
    challstr: "9|abc",
    fetchImpl: fakeFetch,
  });

  assert.equal(assertion, "A1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "POST");
});

test("openAuthenticatedSession connects, logs in, sends trn", async () => {
  const socket = new FakeSocket();

  const fakeFetch = async () => ({
    text: async () => ']{"assertion":"AUTH"}',
  });

  const sessionPromise = openAuthenticatedSession({
    websocketUrl: "wss://sim3.psim.us/showdown/websocket",
    createWebSocket: () => socket,
    username: "bot",
    password: "pass",
    fetchImpl: fakeFetch,
  });

  socket.emit("open");
  setImmediate(() => {
    socket.emit("message", ">lobby\n|challstr|7|token");
  });

  const session = await sessionPromise;
  assert.equal(session.challstr, "7|token");
  assert.equal(session.assertion, "AUTH");
  assert.deepEqual(socket.sent, ["|/trn bot,0,AUTH"]);
});
