import test from "node:test";
import assert from "node:assert/strict";
import { createMatchmaker } from "../src/index.js";

function makeSocket() {
  return {
    sent: [],
    send(text) {
      this.sent.push(text);
    },
  };
}

test("matchmaker search uses dynamic format per call", () => {
  const socket = makeSocket();
  const matchmaker = createMatchmaker({ socket });

  const commands = matchmaker.search({ format: "gen91v1", packedTeam: null });

  assert.deepEqual(commands, ["|/utm null", "|/search gen91v1"]);
  assert.deepEqual(socket.sent, ["|/utm null", "|/search gen91v1"]);
});

test("matchmaker can use default format but still allow override", () => {
  const socket = makeSocket();
  const matchmaker = createMatchmaker({ socket, defaultFormat: "gen91v1", defaultPackedTeam: "PACK" });

  matchmaker.search();
  matchmaker.search({ format: "gen9randombattle" });

  assert.deepEqual(socket.sent, [
    "|/utm PACK",
    "|/search gen91v1",
    "|/utm PACK",
    "|/search gen9randombattle",
  ]);
});

test("matchmaker challenge uses username and dynamic format", () => {
  const socket = makeSocket();
  const matchmaker = createMatchmaker({ socket, defaultPackedTeam: "TEAM" });

  const commands = matchmaker.challenge({ username: "Target", format: "gen91v1" });

  assert.deepEqual(commands, ["|/utm TEAM", "|/challenge Target, gen91v1"]);
});

test("matchmaker accept/reject/cancel helpers", () => {
  const socket = makeSocket();
  const matchmaker = createMatchmaker({ socket, defaultPackedTeam: null });

  matchmaker.accept({ username: "Target" });
  matchmaker.reject({ username: "Spammer" });
  matchmaker.cancelSearch();
  matchmaker.cancelChallenge({ username: "Target" });

  assert.deepEqual(socket.sent, [
    "|/utm null",
    "|/accept Target",
    "|/reject Spammer",
    "|/cancelsearch",
    "|/cancelchallenge Target",
  ]);
});

test("matchmaker validates required fields", () => {
  const socket = makeSocket();
  const matchmaker = createMatchmaker({ socket });

  assert.throws(() => matchmaker.search(), /format is required/);
  assert.throws(() => matchmaker.challenge({ format: "gen91v1" }), /username is required/);
  assert.throws(() => matchmaker.accept({}), /username is required/);
  assert.throws(() => matchmaker.cancelChallenge({}), /username is required/);
});
