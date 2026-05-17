function error(message) {
  return { ok: false, error: message };
}

function moveNeedsExplicitTarget(targetType) {
  return targetType === "normal" || targetType === "adjacentAlly" || targetType === "adjacentAllyOrSelf";
}

function isValidTargetToken(token) {
  return token === "-1" || token === "-2" || token === "-3" || token === "+1" || token === "+2" || token === "+3";
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

function validateActionCount(decision, request) {
  if (request.kind === "move") {
    const requiredCount = request.requiredMoveSlots.length;
    if (decision.actions.length !== requiredCount) {
      return error(`move decision requires ${requiredCount} actions, received ${decision.actions.length}`);
    }
  }

  if (request.kind === "forceSwitch") {
    const requiredCount = request.requiredSwitchSlots.length;
    if (decision.actions.length !== requiredCount) {
      return error(`forceSwitch decision requires ${requiredCount} actions, received ${decision.actions.length}`);
    }
  }

  return { ok: true };
}

function validateMoveOrSwitch(decision, request) {
  if (!Array.isArray(decision?.actions) || decision.actions.length === 0) {
    return error("decision requires non-empty actions array");
  }

  const countCheck = validateActionCount(decision, request);
  if (!countCheck.ok) return countCheck;

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
      if (request.kind === "forceSwitch") {
        return error(`forceSwitch request does not allow move actions (slot ${action.slot})`);
      }
      const active = request.active.find((a) => a.slot === action.slot);
      if (!active) return error(`no active choice exists for slot ${action.slot}`);
      if (!Number.isInteger(action.moveIndex) || !active.legalMoves.includes(action.moveIndex)) {
        return error(`illegal moveIndex ${action.moveIndex} for slot ${action.slot}`);
      }

      const selectedMove = active.moves.find((move) => move.moveIndex === action.moveIndex);
      const moveTargetType = selectedMove?.target ?? null;
      const inDoublesLikeBattle = request.requiredMoveSlots.length > 1;

      if (action.mega && !active.canMegaEvo) {
        return error(`slot ${action.slot} cannot mega evolve this turn`);
      }
      if (action.zmove && !active.canZMove) {
        return error(`slot ${action.slot} cannot use z-move this turn`);
      }
      if (action.max && !active.canDynamax) {
        return error(`slot ${action.slot} cannot dynamax this turn`);
      }
      if (action.tera && !active.canTerastallize) {
        return error(`slot ${action.slot} cannot terastallize this turn`);
      }

      if (inDoublesLikeBattle && moveNeedsExplicitTarget(moveTargetType)) {
        if (typeof action.target !== "string" || !isValidTargetToken(action.target)) {
          return error(`move in slot ${action.slot} requires explicit target token`);
        }
      } else if (action.target && !isValidTargetToken(action.target)) {
        return error(`invalid target token ${action.target} for slot ${action.slot}`);
      }
      continue;
    }

    if (action.type === "switch") {
      if (request.kind === "forceSwitch" && !request.requiredSwitchSlots.includes(action.slot)) {
        return error(`slot ${action.slot} does not require forceSwitch`);
      }
      if (!Number.isInteger(action.switchSlot) || !request.legalSwitches.includes(action.switchSlot)) {
        return error(`illegal switchSlot ${action.switchSlot} for slot ${action.slot}`);
      }
      continue;
    }

    if (action.type === "pass") {
      if (request.kind === "forceSwitch") {
        return error(`forceSwitch request does not allow pass actions (slot ${action.slot})`);
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
