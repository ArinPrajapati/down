# Pending Implementation

This tracks what is still pending after the first Showdown helper work.

## Completed

- [x] Create `lib/showdown` helper package.
- [x] Parse raw Showdown websocket room messages.
- [x] Parse protocol lines for `request`, `win`, `tie`, `error`, and text.
- [x] Normalize `|request|` payloads into local decision request objects.
- [x] Validate local decision objects against the current request.
- [x] Compile local decisions into Showdown choice strings.
- [x] Support singles move choice fixtures.
- [x] Support doubles move choice fixtures.
- [x] Support team preview fixtures.
- [x] Build dynamic `/utm` plus `/search` commands.
- [x] Build dynamic `/utm` plus `/challenge` commands.
- [x] Build matchmaker helpers for `search`, `challenge`, `accept`, `reject`, `cancelSearch`, and `cancelChallenge`.
- [x] Add connection helpers for websocket connect, `challstr`, login assertion, and `/trn`.
- [x] Keep the first target format dynamic, with `gen91v1` usable as the current default/test value.

## Pending: Showdown Helpers

- [x] Add a fixture for forced switch requests.
- [x] Add a fixture for `wait` requests.
- [x] Add validation for action count by request type.
- [x] Add stronger doubles target validation.
- [x] Add support for special move flags: `mega`, `zmove`, `max`, `tera`.
- [x] Add request normalization for `canTerastallize`, `canMegaEvo`, `canZMove`, and `canDynamax` variants from real requests.
- [x] Add helper to parse `|updatesearch|` into active searches and current games.
- [x] Add helper to parse `|updatechallenges|` into incoming and outgoing challenge state.
- [x] Add helper to detect new battle room ids from `|battle|` and `|updatesearch|`.
- [x] Add helper to build `/choose` room send commands from compiled choices.
- [ ] Add more real protocol fixtures captured from live or local Showdown.

## Pending: Runtime Connection

- [ ] Choose and install websocket runtime dependency.
- [ ] Add websocket adapter that uses the selected runtime dependency.
- [ ] Add config loader for username, password, server URL, format, and packed team.
- [ ] Add local smoke runner that logs in and prints parsed protocol blocks.
- [ ] Add private challenge smoke runner.
- [ ] Add search smoke runner for dynamic format ids.
- [ ] Add graceful shutdown and cancel-search behavior.
- [ ] Add reconnect policy for connection drops.

## Pending: Match Loop

- [ ] Create battle room lifecycle controller.
- [ ] Route incoming room messages to the right battle room.
- [ ] Maintain minimal `BattleState`.
- [ ] Reduce protocol events into current battle state.
- [ ] Detect team preview, move request, forced switch, wait, win, and tie states.
- [ ] Send compiled choices to the correct battle room.
- [ ] Fall back to `default` when local decision generation fails.
- [ ] End match cleanly and return result.

## Pending: Logging

- [ ] Create `jsonl` logger.
- [ ] Log raw protocol blocks.
- [ ] Log parsed protocol events.
- [ ] Log normalized requests.
- [ ] Log local decision objects.
- [ ] Log compiled Showdown choices.
- [ ] Log validation failures.
- [ ] Log final match result.
- [ ] Store logs under `runtime/logs/<date>/battle-<roomid>.jsonl`.

## Pending: Decision Layer Before LLM

- [ ] Add a fake decision provider for tests.
- [ ] Add simple deterministic decision provider that always picks the first legal move or `default`.
- [ ] Test full request-to-choice flow without any LLM.
- [ ] Test full mocked match loop with saved protocol fixtures.

## Pending: LLM Layer

- [ ] Wrap `lib/llm.js` behind a local decision model interface.
- [ ] Create stable system prompt.
- [ ] Create dynamic decision prompt renderer.
- [ ] Define strict JSON decision schema.
- [ ] Parse model JSON responses.
- [ ] Repair minor JSON issues.
- [ ] Retry once on validation failure.
- [ ] Enforce decision timeout and send `default` on timeout.
- [ ] Log prompt and model response to `jsonl`.

## Pending: Note Maker

- [ ] Create note store.
- [ ] Keep notes separate from match logs.
- [ ] Write only new, interesting learned facts.
- [ ] Add post-match summarizer that proposes notes from `jsonl`.
- [ ] Require filtering so normal match history does not become notes.
- [ ] Store notes under `runtime/notes/`.

## Pending: Teams

- [ ] Decide first packed team for `gen91v1`.
- [ ] Add team config file or environment-based team input.
- [ ] Validate packed team command generation.
- [ ] Add support for `null` teams where the format allows it.

## Pending: Docs

- [ ] Update `docs/project.md` once implementation direction stabilizes.
- [ ] Document environment variables.
- [ ] Document local test commands.
- [ ] Document smoke-run command.
- [ ] Document the decision JSON schema.

## Next Recommended Work

1. Add `jsonl` logger.
2. Add `updatesearch` and `updatechallenges` parsers.
3. Add forced-switch and wait request fixtures.
4. Add websocket runtime adapter and smoke runner.
