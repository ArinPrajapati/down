# DOWN Implementation Plan

## Purpose

This document fills the planning gaps left in `docs/project.md` without rewriting that file yet.

Core intent:

- connect an LLM-driven agent to Pokemon Showdown
- let it play real matches
- keep the loop simple: read battle state, ask the model for a decision, validate it, send it, log what happened

## What Is Missing In `project.md`

The current project note has the right high-level idea, but it does not yet define:

- the exact MVP format and match flow
- the internal battle state model
- the request/response contract between the agent and the LLM
- how doubles targeting maps to Showdown `/choose` syntax
- how to recover from invalid JSON, invalid choices, timeouts, or disconnects
- what gets logged vs what gets saved as long-term notes
- what modules own each responsibility
- what should be built first vs later

## Product Definition

`DOWN` is a headless battle agent for Pokemon Showdown.

The agent should:

- log into a Showdown server
- search for or accept a match
- track the battle state from protocol messages
- convert each `|request|` into a compact decision prompt
- ask an LLM to choose legal actions
- translate the LLM decision into a valid `/choose ...` command
- send the command before timeout
- log the battle as normal machine-readable records and optionally save reusable learned facts

The system should be able to support:

- `1v1` as a simpler validation mode
- `2v2` doubles / VGC-style play as the main target mode

## Recommended MVP Scope

Do not build all formats at once.

Recommended order:

1. Build one stable match loop first.
2. Validate it in a single known format.
3. Add doubles targeting and richer prompts after the loop is reliable.

Recommended milestone order:

1. `MVP-A`: challenge-based single battle loop with one controlled format
2. `MVP-B`: ladder or repeated matchmaking
3. `MVP-C`: doubles / VGC decision support
4. `MVP-D`: note memory and strategy refinement

Important clarification:

- `VCG` implies doubles, not singles
- if singles is supported, treat it as a separate mode for easier debugging, not the same target product definition

## First Build Priority

Before prompt design or LLM integration, build the Showdown helper layer first.

Reason:

- Showdown protocol and action syntax are the unstable part
- they can be tested deterministically without paying for model calls
- once helpers are correct, prompt work becomes much simpler

So the first practical milestone is:

- create Showdown helpers
- make all action compilation and validation testable
- only then connect prompts and model calls

## Architecture

Keep the architecture centered on one battle room loop and one decision contract.

Suggested structure:

```text
src/
  index.js
  config/
    loadConfig.js
  llm/
    createClient.js
    runDecisionModel.js
    runSummaryModel.js
  showdown/
    client.js
    auth.js
    protocol.js
    commands.js
    matchmaker.js
    helpers/
      parseRoomMessage.js
      parseRequest.js
      compileChoice.js
      validateChoice.js
      normalizeBattleEvent.js
  battle/
    battleRoom.js
    battleState.js
    requestParser.js
    actionCompiler.js
    validator.js
    eventReducer.js
  prompts/
    system.txt
    decision.txt
    summary.txt
    renderDecisionPrompt.js
  notes/
    noteStore.js
    noteWriter.js
  logging/
    logger.js
    battleTranscript.js
  utils/
    jsonRepair.js
    timeBudget.js
```

Mapping from the current `project.md` idea:

- `lib/llm.js` -> keep as third-party dependency, wrapped by `src/llm/createClient.js`
- `showdown` -> `src/showdown/*`
- `agent.js` -> split into `battleRoom.js`, `requestParser.js`, `actionCompiler.js`
- `gameLoop.js` -> absorbed into `battleRoom.js`
- `logger.js` -> `src/logging/logger.js`
- `noteMaker.js` -> `src/notes/*`

## Primary Runtime Objects

### `ShowdownClient`

Owns:

- websocket connection
- login flow with `challstr` and `/trn`
- sending raw commands
- room routing
- reconnect policy

Public methods:

- `connect()`
- `login()`
- `sendGlobal(text)`
- `sendRoom(roomId, text)`
- `onMessage(handler)`
- `close()`

### `BattleRoom`

Owns one battle from team preview to win/loss.

Public methods:

- `start(roomId)`
- `handleProtocolBlock(block)`
- `handleRequest(request)`
- `makeDecision()`
- `finish(result)`

### `BattleState`

Owns the agent's battle understanding.

Should track:

- room id
- format id
- game type: singles or doubles
- player side id: `p1` / `p2`
- team preview information
- known public battle events
- latest server `request`
- turn number
- fainted / active / switched state
- volatile information inferred from protocol
- battle result

### `DecisionEngine`

Owns:

- prompt rendering
- LLM call
- JSON extraction or repair
- conversion to internal decision shape
- local validation
- fallback logic

## Showdown Helpers First

This should be the first implemented layer.

Helpers should be pure or close to pure functions where possible.

Suggested helper set:

- `parseRoomMessage(raw)`  
  Split raw websocket payload into room id and lines.

- `parseProtocolLine(line)`  
  Convert a single protocol line into a typed event shape.

- `parseBattleRequest(json)`  
  Convert `|request|` payload into a normalized decision request.

- `compileChoice(normalizedDecision, request)`  
  Convert internal decision JSON into Showdown `/choose` syntax.

- `validateChoice(normalizedDecision, request)`  
  Reject illegal or incomplete actions before sending.

- `buildSearchCommand(format, team)`  
  Build `/utm` and `/search` commands safely.

- `buildChallengeCommand(user, format, team)`  
  Build `/utm` and `/challenge` commands safely.

- `extractBattleResult(lines)`  
  Detect `|win|` and `|tie|`.

These helpers should not depend on prompt logic.

## The Core Match Loop

The runtime loop should be explicit:

1. Connect websocket.
2. Wait for `|challstr|`.
3. Log in through `/api/login`.
4. Send `/trn`.
5. Search or accept a match.
6. Join the created battle room.
7. Build `BattleRoom` state from incoming protocol messages.
8. When `|request|...` arrives:
9. Normalize legal actions from the request.
10. Render prompt from current state plus legal actions.
11. Ask LLM for a structured decision.
12. Parse and validate the decision locally.
13. Compile decision into `/choose ...`.
14. Send `/choose ...|rqid` when `rqid` exists.
15. Continue until `|win|` or `|tie|`.
16. Write logs, summary, and optional notes.
17. Start the next match.

But before this full loop is live, the helper layer should already be testable with fixtures.

## Important Design Rule

Do not ask the LLM to produce raw Showdown commands directly as the primary interface.

Instead:

- give the LLM a normalized list of legal actions
- have it return structured JSON using indexes and target ids
- compile JSON into Showdown command syntax in code

This reduces:

- hallucinated move names
- malformed doubles targeting
- invalid switches
- parser fragility

## LLM Decision Contract

### Input To The Model

The decision prompt should include:

- battle format and turn number
- whether this is team preview, move choice, or forced switch
- your active Pokemon
- opponent active Pokemon
- reserve team summary
- field conditions
- recent turn events
- known notes relevant to this matchup
- legal action menu generated from `|request|`

The prompt should not depend on the model reconstructing legality from raw logs.
Legality should already be computed by the app.

### Output From The Model

Use a strict JSON schema. Example:

```json
{
  "kind": "move",
  "actions": [
    {
      "slot": 1,
      "type": "move",
      "moveIndex": 2,
      "target": "+1"
    },
    {
      "slot": 2,
      "type": "move",
      "moveIndex": 1,
      "target": "-1"
    }
  ],
  "reason": "Pressure the faster threat and preserve board position.",
  "notes": [
    "Opponent likely values speed control over damage this turn."
  ]
}
```

For singles:

- `actions` has one item

For team preview:

- return ordered slot list, not a raw `team 1234` string

Example:

```json
{
  "kind": "teamPreview",
  "teamOrder": [2, 1, 3, 4],
  "reason": "Lead with speed control and immediate pressure.",
  "notes": []
}
```

## Decision Types To Support

The request parser must classify at least these cases:

- `teamPreview`
- `move`
- `forceSwitch`
- `wait`

`wait` means:

- do not query the LLM
- do not send a choice
- just keep listening

## Why `parse()` Alone Is Not Enough

`project.md` says `prase()` should repair JSON and forward the move.

That is too narrow.

The parser layer should actually do four jobs:

1. extract JSON from model output
2. repair minor JSON issues
3. validate against the expected schema
4. convert to domain objects and reject impossible choices

Rename it to something explicit:

- `parseDecisionResponse()`

## Request Parsing Rules

`|request|` is the source of truth for legal actions.

From the request object, derive:

- active slots that need choices
- legal moves per active slot
- disabled moves
- legal switch targets
- forced switch cases
- whether a target is required
- whether special flags such as mega / tera / zmove / max are allowed
- `rqid`

The battle event stream should inform state, but move legality should always come from the current request.

## Local Action Compiler

Compile model JSON into Showdown syntax in code.

Examples:

- singles move: `move 1`
- singles switch: `switch 3`
- doubles move pair: `move 2 +1, move 1 -1`
- team preview: `team 2134`

If `rqid` exists, append `|RQID` when sending through the server flow.

This compiler should be built and tested before any prompt work starts.

## Local Validator

Before sending a choice, validate:

- every chosen slot exists
- every chosen move index exists and is not disabled
- every switch target is legal and unfainted
- target values are valid for that move
- action count matches active slots that require decisions
- team preview order contains no duplicates

If validation fails:

1. attempt one repair if the problem is trivial
2. otherwise call the LLM again with the validation error
3. if time budget is low, send `default`

For the first milestone, the validator should be exercised only with fixtures and manual test inputs, not model output yet.

## Time Budget Policy

This must be designed early because Showdown battles are time-sensitive.

Recommended rule:

- total decision budget per request: configurable
- reserve a small send buffer
- if LLM call or repair chain exceeds budget, send `default`

Example policy:

- `decision_timeout_ms = 8000`
- `send_buffer_ms = 1500`
- no more than one retry

## Error Handling

### LLM Errors

Cases:

- provider timeout
- malformed JSON
- empty response
- illegal action

Fallback order:

1. repair JSON
2. retry once with explicit validation error
3. send `default`

### Showdown Errors

Cases:

- `|error|[Invalid choice]`
- `|error|[Unavailable choice]`
- disconnect mid-battle
- auth failure
- search cancelled or room lost

Policy:

- if server returns a new `|request|`, treat it as authoritative and recompute
- if connection drops, reconnect only if the battle can still be resumed
- always log the exact protocol block that caused the failure

## Logging vs Notes

Keep these separate.

### `logger`

Purpose:

- debugging
- audit trail
- reproducing bugs

Store:

- one event per line in `jsonl`
- raw protocol messages
- normalized events
- prompts
- model responses
- chosen actions
- validation failures
- final result

### `noteStore`

Purpose:

- reusable learned facts only

Store only compact facts with future value:

- new move interactions discovered in play
- unusual board patterns that mattered
- useful tricks learned from the match
- concise matchup facts worth reusing later

Do not dump normal battle history into notes.
If something is not new or interesting, it stays in the log and does not become a note.

## Prompt Strategy

Use two prompt layers:

### 1. Stable system prompt

Contains:

- role
- battle objective
- output schema rules
- instruction to use only legal options provided

### 2. Dynamic decision prompt

Contains:

- current battle summary
- legal action menu
- recent events
- relevant notes

Optional later layer:

- post-game summarizer prompt to convert transcript into durable notes

## Data Storage

Suggested output layout:

```text
runtime/
  logs/
    2026-05-16/
      battle-<roomid>.jsonl
  notes/
    global.md
    formats/
      <format>.md
  transcripts/
    battle-<roomid>.md
```

Store both:

- `jsonl` event logs for normal recording
- optional derived transcript files for human reading

The `jsonl` logs are the source of truth for match recording and debugging.
Notes are a separate learned-memory layer, not a second copy of the match.

## Battle State Model

At minimum, maintain:

```js
{
  roomId,
  format,
  gameType,
  side: {
    id,
    name,
    active,
    reserve,
  },
  opponent: {
    name,
    active,
    reservePreview,
  },
  field: {
    turn,
    weather,
    terrain,
    trickRoom,
    tailwind,
    hazards,
  },
  recentEvents: [],
  request: null,
  rqid: null,
  result: null
}
```

Do not try to model every hidden mechanic in the first version.
The first version only needs enough state to:

- present the board to the LLM clearly
- keep actions legal
- explain what changed last turn

## Match Entry Modes

Support these as separate entry strategies:

- `challenge`
- `accept`
- `search`

Recommended first implementation:

- `challenge` against a controlled test account

This avoids ladder noise while the loop is still unstable.

## Testing Strategy

You need tests before live laddering.

### Unit tests

- protocol block parsing
- single protocol line parsing
- `|request|` parsing
- action compilation
- validator behavior
- JSON repair behavior

### Fixture tests

Save real request payloads and battle protocol snippets, then test:

- singles move request
- doubles move request
- forced switch
- team preview
- invalid choice recovery
- `/search` command generation
- `/challenge` command generation
- `|win|` / `|tie|` result extraction

### Integration tests

At least one mocked end-to-end loop:

- fake protocol input
- fake decision object
- assert final `/choose` string

Prompt integration tests should come after helper correctness is established.

## Pre-LLM Deliverable

Before connecting prompts, the project should already be able to do this:

1. read saved protocol fixtures
2. parse them into normalized events
3. parse saved `|request|` payloads
4. accept a hand-written decision object
5. validate it
6. compile it into a correct Showdown choice string
7. write the result into `jsonl`

If this works, then the LLM only needs to fill one gap:

- produce the decision object

## Implementation Order

### Phase 1: Showdown helpers

- room message parser
- protocol line parser
- request parser
- action compiler
- action validator
- command builders
- battle fixture tests
- structured `jsonl` logger

### Phase 2: Connection layer

- config loader
- showdown websocket client
- login flow
- room routing
- basic challenge or search flow

### Phase 3: Battle loop

- battle room state
- event reducer
- per-room lifecycle
- end-of-match handling

### Phase 4: LLM decisions

- LLM wrapper using `llm.js`
- prompt renderer
- schema parser
- fallback and timeout policy

### Phase 5: Persistence

- transcript writer
- note store
- post-game summarizer

### Phase 6: Doubles depth

- multi-slot targeting
- richer board summary
- better recent event compression

## Practical MVP Decisions

These should be fixed early:

1. Runtime language: use Node.js with ESM consistently.
2. First format: choose one exact format id and keep it fixed through MVP.
3. First entry mode: use direct challenge, not ladder.
4. First memory mode: local files only, no database.
5. First fallback: `default`, not another custom heuristic engine.

## Open Product Decisions

These are still undefined and should be answered before coding too far:

1. What is the exact first format id?
2. Are we targeting current-gen doubles immediately, or validating first in singles?
3. Will the bot use fixed teams only, or support team import / packing?
4. Do we want one long-lived conversation per battle, or stateless per-turn calls with summarized context?
5. Should notes persist across all games, per format, or per team?

## Recommended Answers

If you want the fastest path to a working system, use:

1. Node.js ESM
2. showdown helpers and fixture tests before prompts
3. challenge-based private testing first
4. one fixed team per format
5. stateless per-turn decision calls
6. file-based logs and notes
7. singles for loop validation, then doubles for actual VGC-style play

The key reason for stateless per-turn calls:

- easier retry behavior
- clearer prompt control
- less context drift
- simpler logging and debugging

## Definition Of Done For First Usable Version

The first usable version is done when it can:

1. log into Showdown
2. enter a battle automatically
3. survive a full match without manual input
4. answer every `|request|` with a legal action
5. record prompt, response, chosen command, and result
6. write the match record as `jsonl`
7. recover safely by sending `default` when the LLM fails

## Summary

The project should be built around one strict rule:

the LLM chooses from legal structured options, and code owns protocol correctness.

That separation is what will make the bot stable enough to play real Showdown matches.

Operationally:

- match history is normal `jsonl` logging
- `noteMaker` is only for new interesting facts learned from play
