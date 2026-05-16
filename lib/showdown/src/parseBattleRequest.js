function getChoiceKind(request) {
  if (request?.wait) return "wait";
  if (Array.isArray(request?.forceSwitch) && request.forceSwitch.some(Boolean)) return "forceSwitch";
  if (request?.teamPreview) return "teamPreview";
  if (Array.isArray(request?.active)) return "move";
  return "unknown";
}

function parseActiveChoices(active) {
  if (!Array.isArray(active)) return [];

  const out = [];
  for (let i = 0; i < active.length; i += 1) {
    const slot = i + 1;
    const item = active[i] || {};
    const moves = Array.isArray(item.moves)
      ? item.moves.map((move, index) => ({
          moveIndex: index + 1,
          id: move.id,
          name: move.move,
          target: move.target,
          disabled: Boolean(move.disabled),
          pp: move.pp,
          maxpp: move.maxpp,
        }))
      : [];

    const legalMoves = moves.filter((m) => !m.disabled).map((m) => m.moveIndex);

    out.push({
      slot,
      canDynamax: Boolean(item.canDynamax),
      canMegaEvo: Boolean(item.canMegaEvo),
      canTerastallize: Boolean(item.canTerastallize),
      canZMove: Boolean(item.canZMove),
      trapped: Boolean(item.trapped),
      moves,
      legalMoves,
    });
  }

  return out;
}

function parseSwitchChoices(sidePokemon) {
  if (!Array.isArray(sidePokemon)) return [];

  return sidePokemon.map((p, index) => {
    const fainted = typeof p?.condition === "string" && p.condition.includes(" fnt");
    return {
      slot: index + 1,
      ident: p?.ident || "",
      details: p?.details || "",
      active: Boolean(p?.active),
      condition: p?.condition || "",
      fainted,
    };
  });
}

export function parseBattleRequest(request) {
  const kind = getChoiceKind(request);
  const active = parseActiveChoices(request?.active);
  const sidePokemon = parseSwitchChoices(request?.side?.pokemon);

  const legalSwitches = sidePokemon
    .filter((p) => !p.active && !p.fainted)
    .map((p) => p.slot);

  return {
    kind,
    rqid: request?.rqid ?? null,
    wait: Boolean(request?.wait),
    forceSwitch: Array.isArray(request?.forceSwitch) ? request.forceSwitch.map(Boolean) : [],
    teamPreview: Boolean(request?.teamPreview),
    maxTeamSize: request?.maxTeamSize ?? null,
    side: {
      id: request?.side?.id ?? null,
      name: request?.side?.name ?? null,
      pokemon: sidePokemon,
    },
    active,
    legalSwitches,
    raw: request,
  };
}
