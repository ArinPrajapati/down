function error(message) {
  return { ok: false, error: message };
}

function validateTeamPreview(decision, request) {
  if (!Array.isArray(decision?.teamOrder) || decision.teamOrder.length === 0) {
    return error("teamPreview decision requires non-empty teamOrder array");
  }

  const unique = new Set(decision.teamOrder);
  if (unique.size !== decision.teamOrder.length) {
    return error("teamPreview teamOrder cannot contain duplicates");
  }

  const maxSlot = request.side.pokemon.length;
  for (const slot of decision.teamOrder) {
    if (!Number.isInteger(slot) || slot < 1 || slot > maxSlot) {
      return error(`teamPreview slot out of range: ${slot}`);
    }
  }

  return { ok: true };
}

function validateMoveOrSwitch(decision, request) {
  if (!Array.isArray(decision?.actions) || decision.actions.length === 0) {
    return error("decision requires non-empty actions array");
  }

  const seenSlots = new Set();

  for (const action of decision.actions) {
    if (!Number.isInteger(action.slot) || action.slot < 1) {
      return error(`invalid action slot: ${action?.slot}`);
    }
    if (seenSlots.has(action.slot)) {
      return error(`duplicate action slot: ${action.slot}`);
    }
    seenSlots.add(action.slot);

    if (action.type === "move") {
      const active = request.active.find((a) => a.slot === action.slot);
      if (!active) return error(`no active choice exists for slot ${action.slot}`);
      if (!Number.isInteger(action.moveIndex) || !active.legalMoves.includes(action.moveIndex)) {
        return error(`illegal moveIndex ${action.moveIndex} for slot ${action.slot}`);
      }
      continue;
    }

    if (action.type === "switch") {
      if (!Number.isInteger(action.switchSlot) || !request.legalSwitches.includes(action.switchSlot)) {
        return error(`illegal switchSlot ${action.switchSlot} for slot ${action.slot}`);
      }
      continue;
    }

    return error(`unsupported action type: ${action.type}`);
  }

  return { ok: true };
}

export function validateChoice(decision, request) {
  if (!request || !request.kind) return error("missing parsed request");

  if (request.kind === "wait") {
    if (decision?.kind !== "wait") return error("wait request requires wait decision");
    return { ok: true };
  }

  if (request.kind === "teamPreview") {
    return validateTeamPreview(decision, request);
  }

  if (request.kind === "move" || request.kind === "forceSwitch") {
    return validateMoveOrSwitch(decision, request);
  }

  return error(`unsupported request kind: ${request.kind}`);
}
