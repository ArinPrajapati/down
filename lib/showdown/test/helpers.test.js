import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseRoomMessage,
  parseProtocolLine,
  parseBattleRequest,
  validateChoice,
  compileChoice,
  buildSearchCommands,
  buildChallengeCommands,
  extractBattleResult,
} from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures");

function loadFixture(name) {
  const text = fs.readFileSync(path.join(fixturesDir, name), "utf8");
  return JSON.parse(text);
}

test("parseRoomMessage splits room and lines", () => {
  const raw = ">battle-gen9vgc-123\n|turn|1\n|request|{\"rqid\":1}\n\n>lobby\n|c| user|hi";
  const blocks = parseRoomMessage(raw);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].roomId, "battle-gen9vgc-123");
  assert.equal(blocks[0].lines[0], "|turn|1");
  assert.equal(blocks[1].roomId, "lobby");
});

test("parseProtocolLine handles request and win", () => {
  const request = parseProtocolLine("|request|{\"rqid\":7}");
  assert.equal(request.type, "request");
  assert.equal(request.request.rqid, 7);

  const win = parseProtocolLine("|win|Bot");
  assert.equal(win.type, "win");
  assert.equal(win.winner, "Bot");
});

test("singles request parses and compiles valid move", () => {
  const req = parseBattleRequest(loadFixture("request-singles.json"));
  assert.equal(req.kind, "move");
  assert.deepEqual(req.legalSwitches, [2]);

  const decision = {
    kind: "move",
    actions: [{ slot: 1, type: "move", moveIndex: 2 }],
  };

  const valid = validateChoice(decision, req);
  assert.equal(valid.ok, true);

  const command = compileChoice(decision, req);
  assert.equal(command, "move 2|3");
});

test("validator rejects illegal move", () => {
  const req = parseBattleRequest(loadFixture("request-singles.json"));
  const badDecision = {
    kind: "move",
    actions: [{ slot: 1, type: "move", moveIndex: 3 }],
  };

  const valid = validateChoice(badDecision, req);
  assert.equal(valid.ok, false);
  assert.match(valid.error, /illegal moveIndex/);
});

test("doubles request compiles two choices with targets", () => {
  const req = parseBattleRequest(loadFixture("request-doubles.json"));
  assert.equal(req.kind, "move");

  const decision = {
    kind: "move",
    actions: [
      { slot: 1, type: "move", moveIndex: 1, target: "+1" },
      { slot: 2, type: "move", moveIndex: 1, target: "-1" },
    ],
  };

  const command = compileChoice(decision, req);
  assert.equal(command, "move 1 +1, move 1 -1|9");
});

test("team preview decision compiles", () => {
  const req = parseBattleRequest(loadFixture("request-team-preview.json"));
  assert.equal(req.kind, "teamPreview");

  const decision = {
    kind: "teamPreview",
    teamOrder: [2, 1, 3, 4],
  };

  const command = compileChoice(decision, req);
  assert.equal(command, "team 2134|1");
});

test("build search/challenge commands and extract result", () => {
  const search = buildSearchCommands({ format: "gen91v1", packedTeam: null });
  assert.deepEqual(search, ["|/utm null", "|/search gen91v1"]);

  const challenge = buildChallengeCommands({ username: "targetUser", format: "gen91v1", packedTeam: "PACK" });
  assert.deepEqual(challenge, ["|/utm PACK", "|/challenge targetUser, gen91v1"]);

  const result = extractBattleResult(["|turn|4", "|win|Bot"]);
  assert.deepEqual(result, { done: true, type: "win", winner: "Bot" });
});
