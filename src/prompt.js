function toPromptRequest(request) {
  return {
    kind: request.kind,
    rqid: request.rqid,
    wait: request.wait,
    forceSwitch: request.forceSwitch,
    teamPreview: request.teamPreview,
    maxTeamSize: request.maxTeamSize,
    side: {
      id: request.side?.id ?? null,
      name: request.side?.name ?? null,
      pokemon: Array.isArray(request.side?.pokemon)
        ? request.side.pokemon.map((p) => ({
            slot: p.slot,
            ident: p.ident,
            details: p.details,
            active: p.active,
            condition: p.condition,
            fainted: p.fainted,
          }))
        : [],
    },
    active: Array.isArray(request.active)
      ? request.active.map((a) => ({
          slot: a.slot,
          canDynamax: a.canDynamax,
          canMegaEvo: a.canMegaEvo,
          canTerastallize: a.canTerastallize,
          canZMove: a.canZMove,
          trapped: a.trapped,
          legalMoves: a.legalMoves,
          moves: a.moves.map((m) => ({
            moveIndex: m.moveIndex,
            id: m.id,
            name: m.name,
            target: m.target,
            disabled: m.disabled,
            pp: m.pp,
            maxpp: m.maxpp,
          })),
        }))
      : [],
    legalSwitches: request.legalSwitches,
    requiredMoveSlots: request.requiredMoveSlots,
    requiredSwitchSlots: request.requiredSwitchSlots,
  };
}

export function renderDecisionPrompt(request) {
  const requestJson = JSON.stringify(toPromptRequest(request), null, 2);
  const sideId = request?.side?.id ?? "unknown";
  const sideName = request?.side?.name ?? "unknown";
  const requestKind = request?.kind ?? "unknown";

  return `You are playing as ${sideId} (${sideName}) in a Pokemon Showdown battle.
Current request kind: ${requestKind}

Choose one legal action for the current request.
Return only valid JSON. Do not use markdown. Do not explain outside JSON.

Rules:
- Your goal is to maximize the chance to win the battle, not merely to return any legal move.
- Use only the legal choices shown in the request.
- Move and switch numbers are 1-based indexes from the request.
- Never invent moves, switches, or targets.
- Legality is a hard constraint. Winning is the objective.
- Prefer lines that likely secure a KO, create strong damage, deny the opponent's best line, or preserve your win condition.
- Avoid low-value or dead turns like using a move that obviously fails, repeating Fake Out after the first turn out, or clicking purely passive moves when strong progress is available.
- Switch only when staying in is clearly worse than the best legal switch.
- At team preview, choose the order that gives the strongest overall matchup, speed control, and offensive pressure.
- If the request is team preview, return type "teamPreview" with an order array.
- If the request is a move turn, return type "move" with one action per active Pokemon.
- If the request is a forced switch, return type "switch" with one action per forced switch slot.
- If unsure, return type "default".
- Keep reason short but strategic.

Battle request:
${requestJson}

Return JSON matching one of these shapes:

Move:
{"type":"move","actions":[{"slot":1,"move":1,"target":null}],"reason":"short reason"}

Switch:
{"type":"switch","actions":[{"slot":1,"pokemon":2}],"reason":"short reason"}

Team preview:
{"type":"teamPreview","order":[1,2,3,4,5,6],"reason":"short reason"}

Default:
{"type":"default","reason":"fallback"}`;
}

export function renderRetryPrompt(previousPrompt, previousResponseText, validationError) {
  return `${previousPrompt}

Your previous response was invalid.
Validation error: ${validationError}
Previous response:
${previousResponseText}

Return corrected JSON only.`;
}
