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
  parseUpdateSearch,
  parseUpdateChallenges,
  detectBattleRoomIds,
  buildChooseRoomCommand,
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

  const updateSearch = parseProtocolLine("|updatesearch|{\"searching\":[\"gen91v1\"],\"games\":{\"battle-gen91v1-1\":\"A vs. B\"}}");
  assert.equal(updateSearch.type, "updatesearch");
  assert.equal(updateSearch.state.searching[0], "gen91v1");

  const battle = parseProtocolLine("|battle|battle-gen91v1-1|A|B");
  assert.equal(battle.type, "battle");
  assert.equal(battle.roomId, "battle-gen91v1-1");
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

test("doubles validator requires explicit target for normal-target move", () => {
  const req = parseBattleRequest(loadFixture("request-doubles.json"));
  const decision = {
    kind: "move",
    actions: [
      { slot: 1, type: "move", moveIndex: 1 },
      { slot: 2, type: "move", moveIndex: 2, target: "-1" },
    ],
  };

  const valid = validateChoice(decision, req);
  assert.equal(valid.ok, false);
  assert.match(valid.error, /requires explicit target/);
});

test("validator enforces action count by request type", () => {
  const req = parseBattleRequest(loadFixture("request-doubles.json"));
  const decision = {
    kind: "move",
    actions: [{ slot: 1, type: "move", moveIndex: 1, target: "+1" }],
  };

  const valid = validateChoice(decision, req);
  assert.equal(valid.ok, false);
  assert.match(valid.error, /requires 2 actions/);
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

test("force switch request only allows required switch actions", () => {
  const req = parseBattleRequest(loadFixture("request-force-switch.json"));
  assert.equal(req.kind, "forceSwitch");
  assert.deepEqual(req.requiredSwitchSlots, [1]);

  const okDecision = {
    kind: "forceSwitch",
    actions: [{ slot: 1, type: "switch", switchSlot: 3 }],
  };
  assert.equal(validateChoice(okDecision, req).ok, true);
  assert.equal(compileChoice(okDecision, req), "switch 3|11");

  const badDecision = {
    kind: "forceSwitch",
    actions: [{ slot: 2, type: "switch", switchSlot: 3 }],
  };
  const bad = validateChoice(badDecision, req);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /does not require forceSwitch/);
});

test("wait request validates wait decision", () => {
  const req = parseBattleRequest(loadFixture("request-wait.json"));
  assert.equal(req.kind, "wait");
  assert.equal(validateChoice({ kind: "wait" }, req).ok, true);

  const bad = validateChoice({ kind: "move", actions: [] }, req);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /wait request requires wait decision/);
});

test("request parser normalizes special move capability variants", () => {
  const req = parseBattleRequest({
    active: [
      {
        canMegaEvo: "1",
        canDynamax: {},
        canTerastallize: "Electric",
        canZMove: [{ move: "Gigavolt Havoc", target: "normal" }],
        moves: [
          { move: "Thunderbolt", id: "thunderbolt", pp: 24, maxpp: 24, target: "normal", disabled: false },
        ],
      },
    ],
    side: {
      id: "p1",
      name: "Bot",
      pokemon: [{ ident: "p1: Rotom", details: "Rotom", condition: "100/100", active: true }],
    },
  });

  assert.equal(req.active[0].canMegaEvo, true);
  assert.equal(req.active[0].canDynamax, false);
  assert.equal(req.active[0].canTerastallize, true);
  assert.equal(req.active[0].canZMove, true);
});

test("validator enforces special move flag capabilities", () => {
  const req = parseBattleRequest({
    active: [
      {
        canMegaEvo: false,
        canDynamax: false,
        canTerastallize: false,
        canZMove: false,
        moves: [
          { move: "Thunderbolt", id: "thunderbolt", pp: 24, maxpp: 24, target: "normal", disabled: false },
        ],
      },
    ],
    side: {
      id: "p1",
      name: "Bot",
      pokemon: [{ ident: "p1: Rotom", details: "Rotom", condition: "100/100", active: true }],
    },
  });

  const badMega = validateChoice({
    kind: "move",
    actions: [{ slot: 1, type: "move", moveIndex: 1, mega: true }],
  }, req);
  assert.equal(badMega.ok, false);
  assert.match(badMega.error, /cannot mega evolve/);

  const badTera = validateChoice({
    kind: "move",
    actions: [{ slot: 1, type: "move", moveIndex: 1, tera: true }],
  }, req);
  assert.equal(badTera.ok, false);
  assert.match(badTera.error, /cannot terastallize/);
});

test("build search/challenge commands and extract result", () => {
  const search = buildSearchCommands({ format: "gen91v1", packedTeam: null });
  assert.deepEqual(search, ["|/utm null", "|/search gen91v1"]);

  const challenge = buildChallengeCommands({ username: "targetUser", format: "gen91v1", packedTeam: "PACK" });
  assert.deepEqual(challenge, ["|/utm PACK", "|/challenge targetUser, gen91v1"]);

  const result = extractBattleResult(["|turn|4", "|win|Bot"]);
  assert.deepEqual(result, { done: true, type: "win", winner: "Bot" });
});

test("protocol state helpers parse updates and detect room ids", () => {
  const updatesearch = parseUpdateSearch("|updatesearch|{\"searching\":[\"gen91v1\"],\"games\":{\"battle-gen91v1-1\":\"A vs. B\",\"groupchat-room\":\"x\"}}");
  assert.deepEqual(updatesearch.searching, ["gen91v1"]);
  assert.equal(updatesearch.games["battle-gen91v1-1"], "A vs. B");

  const updatechallenges = parseUpdateChallenges("|updatechallenges|{\"challengesFrom\":{\"userx\":\"gen91v1\"},\"challengeTo\":{\"to\":\"usery\",\"format\":\"gen91v1\"}}");
  assert.equal(updatechallenges.challengesFrom.userx, "gen91v1");
  assert.equal(updatechallenges.challengeTo.to, "usery");

  const idsFromBattle = detectBattleRoomIds("|battle|battle-gen91v1-777|A|B");
  assert.deepEqual(idsFromBattle, ["battle-gen91v1-777"]);

  const idsFromSearch = detectBattleRoomIds("|updatesearch|{\"searching\":[],\"games\":{\"battle-gen91v1-1\":\"A vs. B\",\"lobby\":\"lobby\"}}");
  assert.deepEqual(idsFromSearch, ["battle-gen91v1-1"]);
});

test("buildChooseRoomCommand formats room choose command", () => {
  const line = buildChooseRoomCommand({
    roomId: "battle-gen91v1-1",
    compiledChoice: "move 1|9",
  });
  assert.equal(line, "battle-gen91v1-1|/choose move 1|9");
});
