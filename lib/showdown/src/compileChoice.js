import { validateChoice } from "./validateChoice.js";

function compileSingleAction(action) {
  if (action.type === "move") {
    let output = `move ${action.moveIndex}`;
    if (action.target) output += ` ${action.target}`;
    if (action.mega) output += " mega";
    if (action.zmove) output += " zmove";
    if (action.max) output += " max";
    if (action.tera) output += " terastallize";
    return output;
  }

  if (action.type === "switch") {
    return `switch ${action.switchSlot}`;
  }

  if (action.type === "pass") {
    return "pass";
  }

  throw new Error(`Unsupported action type: ${action.type}`);
}

export function compileChoice(decision, request) {
  const valid = validateChoice(decision, request);
  if (!valid.ok) {
    throw new Error(valid.error);
  }

  let choice;

  if (request.kind === "wait") {
    choice = "";
  } else if (request.kind === "teamPreview") {
    choice = `team ${decision.teamOrder.join("")}`;
  } else {
    const sorted = [...decision.actions].sort((a, b) => a.slot - b.slot);
    choice = sorted.map(compileSingleAction).join(", ");
  }

  if (request.rqid !== null && request.rqid !== undefined && choice) {
    return `${choice}|${request.rqid}`;
  }

  return choice;
}
