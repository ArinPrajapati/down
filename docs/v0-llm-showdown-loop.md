# V0 LLM Showdown Fight Loop

## Goal

Build the first working version where an LLM can fight a real person on Pokemon Showdown.

Nothing else matters for v0.

The v0 loop is:

1. Log in to Showdown.
2. Start or accept one battle.
3. Wait for a battle request.
4. Convert the request into a simple prompt.
5. Ask the LLM for one legal action.
6. Validate and compile the action into a Showdown `/choose` command.
7. Send the command.
8. Repeat until the battle ends.

## Non-Goals For V0

Do not build these yet:

- long-term memory
- note maker
- advanced strategy learning
- multiple simultaneous battles
- ladder automation beyond one match
- fancy prompts
- rich battle analysis
- UI
- team builder
- post-match summaries
- complex reconnect logic
- perfect support for every format

These can come after the bot can complete one real battle loop.

## First Target

Use one simple target format first.

Recommended first format:

- `gen91v1`

Reason:

- one active Pokemon
- one action per turn
- simpler validation
- easier to see whether the LLM loop works

After v0 works, add doubles/VGC.

## Required V0 Behavior

The bot must be able to:

- connect to Pokemon Showdown websocket
- receive `challstr`
- login with username/password
- set packed team if required
- start one match by challenge or search
- detect the battle room id
- route battle room messages to one battle loop
- parse `|request|` messages
- detect `wait` requests and do nothing
- detect team preview requests
- detect move requests
- detect forced switch requests
- send a legal `/choose ...` command
- detect `|win|` or `|tie|`
- exit cleanly after the battle ends

## Minimal Runtime Modules

Keep the first implementation small.

Suggested files:

```text
src/
  config.js
  main.js
  showdownClient.js
  battleLoop.js
  decisionEngine.js
  prompt.js
```

If using the existing helper package, wire these files to `lib/showdown` helpers instead of duplicating protocol code.

## Module Responsibilities

### `config.js`

Load only what v0 needs:

- Showdown websocket URL
- Showdown login URL
- username
- password
- format id
- packed team
- LLM provider/model/API key config
- mode: `challenge` or `search`
- target username if using challenge mode

### `showdownClient.js`

Own Showdown transport:

- open websocket
- wait for `challstr`
- login
- send `/trn`
- send global commands
- send room commands
- expose incoming protocol blocks
- close connection

### `battleLoop.js`

Own one battle from start to finish:

- receive protocol blocks for one room
- update minimal battle state
- handle `|request|`
- call decision engine only when action is needed
- send compiled choice
- stop on win/tie/loss

### `decisionEngine.js`

Own LLM decision flow:

- render prompt from normalized request
- call LLM
- parse JSON
- validate action locally
- retry once if invalid
- return fallback action if still invalid

### `prompt.js`

Own the first simple prompt template.

Do not over-optimize this yet. The prompt only needs to produce usable JSON.

## V0 Battle State

Keep only the state needed to prompt and choose.

Track:

- room id
- player side: `p1` or `p2`
- current turn number if visible
- latest normalized request
- active Pokemon names/species from request
- available moves
- available switches
- request type: `teamPreview`, `move`, `forceSwitch`, or `wait`
- battle result: `win`, `loss`, or `tie`

Do not build a full simulator in v0.

## Decision JSON Contract

The LLM must return only JSON.

### Move Request

```json
{
  "type": "move",
  "actions": [
    {
      "slot": 1,
      "move": 1,
      "target": null
    }
  ],
  "reason": "short reason"
}
```

### Switch Request

```json
{
  "type": "switch",
  "actions": [
    {
      "slot": 1,
      "pokemon": 2
    }
  ],
  "reason": "short reason"
}
```

### Team Preview Request

```json
{
  "type": "teamPreview",
  "order": [1, 2, 3, 4, 5, 6],
  "reason": "short reason"
}
```

### Default Fallback

```json
{
  "type": "default",
  "reason": "fallback"
}
```

## First Prompt

Use this as the v0 prompt. It is intentionally simple.

```text
You are playing a Pokemon Showdown battle.

Choose one legal action for the current request.
Return only valid JSON. Do not use markdown. Do not explain outside JSON.

Rules:
- Use only the legal choices shown in the request.
- If the request is team preview, return type "teamPreview" with an order array.
- If the request is a move turn, return type "move" with one action per active Pokemon.
- If the request is a forced switch, return type "switch" with one action per forced switch slot.
- If unsure, return type "default".
- Keep reason short.

Battle request:
{{REQUEST_JSON}}

Return JSON matching one of these shapes:

Move:
{"type":"move","actions":[{"slot":1,"move":1,"target":null}],"reason":"short reason"}

Switch:
{"type":"switch","actions":[{"slot":1,"pokemon":2}],"reason":"short reason"}

Team preview:
{"type":"teamPreview","order":[1,2,3,4,5,6],"reason":"short reason"}

Default:
{"type":"default","reason":"fallback"}
```

## Showdown Choice Mapping

The local decision must compile to Showdown commands.

Examples:

```text
{"type":"move","actions":[{"slot":1,"move":1,"target":null}]}
=> /choose move 1

{"type":"switch","actions":[{"slot":1,"pokemon":2}]}
=> /choose switch 2

{"type":"teamPreview","order":[1,2,3,4,5,6]}
=> /choose team 123456

{"type":"default"}
=> /choose default
```

For v0 singles, targets can usually be `null`.

Doubles target support can come after v0 unless the first target format requires it.

## Error Handling

Use simple hard rules:

- If request type is `wait`, do nothing.
- If LLM times out, send `/choose default`.
- If LLM returns invalid JSON, retry once with a short correction prompt.
- If JSON parses but fails validation, retry once and include validation error.
- If retry fails, send `/choose default`.
- If Showdown sends an error after a choice, log it and use default on the next actionable request.

## Logging For V0

Use console logging only unless JSONL already exists.

Log:

- connection started
- login success/failure
- match search/challenge sent
- battle room detected
- request type received
- prompt sent to LLM
- raw LLM response
- parsed decision
- compiled command
- battle result

Do not build the full logger before the fight loop works.

## Implementation Tasks

### Phase 1: Runtime Wiring

- [ ] Add `src/config.js` for required env/config values.
- [ ] Add `src/showdownClient.js` or wrap existing `lib/showdown` connection helpers.
- [ ] Add `src/main.js` entrypoint.
- [ ] Connect websocket and wait for `challstr`.
- [ ] Login and send `/trn`.
- [ ] Add command to set team with `/utm` when a packed team is configured.
- [ ] Add challenge or search command for one format.
- [ ] Detect battle room id from Showdown protocol messages.

### Phase 2: One Battle Loop

- [ ] Add `src/battleLoop.js`.
- [ ] Route messages for the detected battle room into the loop.
- [ ] Parse `|request|` payloads with existing helper code.
- [ ] Ignore `wait` requests.
- [ ] Detect team preview, move, and forced switch requests.
- [ ] Detect `|win|` and `|tie|`.
- [ ] Stop the loop when battle ends.

### Phase 3: LLM Decision Engine

- [ ] Add `src/prompt.js` with the v0 prompt template.
- [ ] Add `src/decisionEngine.js`.
- [ ] Wrap `lib/llm.js` behind one `decide(request)` function.
- [ ] Render normalized Showdown request into `{{REQUEST_JSON}}`.
- [ ] Call the configured LLM model.
- [ ] Extract and parse JSON response.
- [ ] Validate parsed decision against legal choices.
- [ ] Retry once on invalid JSON or invalid decision.
- [ ] Return `default` if the retry fails.

### Phase 4: Choice Sending

- [ ] Compile valid decisions into Showdown choice strings with existing helper code.
- [ ] Send the choice as `battle-room-id|/choose ...`.
- [ ] Print the final command to console before sending.
- [ ] Confirm the loop waits for the next request before asking LLM again.

### Phase 5: Smoke Test

- [ ] Run one private challenge against a human or second account.
- [ ] Verify the bot chooses at team preview.
- [ ] Verify the bot chooses a move.
- [ ] Verify the bot handles forced switch or default fallback.
- [ ] Verify the bot exits after `|win|` or `|tie|`.
- [ ] Save any protocol cases that break parsing as fixtures for later.

## V0 Done Definition

V0 is done when:

- one command starts the bot
- the bot logs into Showdown
- the bot enters one battle against a person
- every actionable request goes through the LLM decision loop
- legal LLM actions are sent to Showdown
- invalid LLM output falls back safely
- the battle reaches an end state without manual move entry

## After V0

Only after the above works, add:

- better prompts
- doubles/VGC target support
- JSONL logs
- notes/memory
- repeated matchmaking
- stronger battle state
- better strategy context
- team improvement loop
