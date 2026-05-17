const STAT_MAP = {
  HP: "hp",
  Atk: "atk",
  Def: "def",
  SpA: "spa",
  SpD: "spd",
  Spe: "spe",
};

export const DEFAULT_TEAM_EXPORT = `Rayquaza @ Clear Amulet
Ability: Air Lock
Level: 100
Tera Type: Normal
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Dragon Ascent
- Extreme Speed
- Earthquake
- Protect

Kyurem-White @ Life Orb
Ability: Turboblaze
Level: 100
Tera Type: Fire
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Draco Meteor
- Freeze-Dry
- Fusion Flare
- Protect

Whimsicott @ Focus Sash
Ability: Prankster
Level: 100
Tera Type: Ghost
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Tailwind
- Moonblast
- Encore
- Taunt

Amoonguss @ Rocky Helmet
Ability: Regenerator
Level: 100
Tera Type: Water
EVs: 236 HP / 156 Def / 116 SpD
Sassy Nature
IVs: 0 Spe
- Rage Powder
- Spore
- Pollen Puff
- Protect

Raichu @ Covert Cloak
Ability: Lightning Rod
Level: 100
Tera Type: Flying
EVs: 252 HP / 4 SpA / 252 Spe
Timid Nature
- Fake Out
- Nuzzle
- Volt Switch
- Protect

Landorus @ Safety Goggles
Ability: Sheer Force
Level: 100
Tera Type: Poison
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Stealth Rock
- Earth Power
- Sludge Bomb
- Protect`;

function packName(name) {
  if (!name) return "";
  return String(name).replace(/[^A-Za-z0-9]+/g, "");
}

function parseStatsLine(line, defaults) {
  const stats = { ...defaults };
  const value = line.split(":")[1]?.trim() ?? "";
  if (!value) return stats;

  for (const part of value.split("/")) {
    const [rawNumber, rawStat] = part.trim().split(/\s+/);
    const statKey = STAT_MAP[rawStat];
    const number = Number(rawNumber);
    if (!statKey || Number.isNaN(number)) continue;
    stats[statKey] = number;
  }

  return stats;
}

function parseFirstLine(line, set) {
  let left = line.trim();
  const atIndex = left.lastIndexOf(" @ ");
  if (atIndex !== -1) {
    set.item = left.slice(atIndex + 3).trim();
    left = left.slice(0, atIndex).trim();
  }

  if (left.endsWith(" (M)")) {
    set.gender = "M";
    left = left.slice(0, -4);
  } else if (left.endsWith(" (F)")) {
    set.gender = "F";
    left = left.slice(0, -4);
  }

  if (left.endsWith(")") && left.includes("(")) {
    const open = left.lastIndexOf("(");
    const name = left.slice(0, open).trim();
    const species = left.slice(open + 1, -1).trim();
    set.name = name;
    set.species = species;
  } else {
    set.name = "";
    set.species = left;
  }
}

export function importExportedTeam(buffer) {
  const lines = String(buffer ?? "")
    .split("\n")
    .map((line) => line.trim());

  const sets = [];
  let current = null;

  for (const line of lines) {
    if (!line || line === "---") {
      current = null;
      continue;
    }

    if (!current) {
      current = {
        name: "",
        species: "",
        item: "",
        ability: "",
        moves: [],
        nature: "",
        gender: "",
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        level: 100,
        teraType: "",
      };
      parseFirstLine(line, current);
      sets.push(current);
      continue;
    }

    if (line.startsWith("Ability: ")) {
      current.ability = line.slice("Ability: ".length).trim();
      continue;
    }

    if (line.startsWith("Level: ")) {
      const level = Number(line.slice("Level: ".length).trim());
      if (!Number.isNaN(level)) current.level = level;
      continue;
    }

    if (line.startsWith("Tera Type: ")) {
      current.teraType = line.slice("Tera Type: ".length).trim();
      continue;
    }

    if (line.startsWith("EVs: ")) {
      current.evs = parseStatsLine(line, current.evs);
      continue;
    }

    if (line.startsWith("IVs: ")) {
      current.ivs = parseStatsLine(line, current.ivs);
      continue;
    }

    if (/^[A-Za-z]+ Nature$/.test(line)) {
      current.nature = line.replace(/ Nature$/, "").trim();
      continue;
    }

    if (line.startsWith("- ")) {
      current.moves.push(line.slice(2).trim());
    }
  }

  return sets;
}

export function packTeam(team) {
  const sets = Array.isArray(team) ? team : [];

  function getIv(ivs, statId) {
    const value = ivs?.[statId];
    return value === 31 || value == null ? "" : String(value);
  }

  const packedSets = sets.map((set) => {
    const name = set.name || set.species;
    const speciesPacked = packName(set.species || set.name);
    const namePacked = packName(name);

    const segments = [];

    segments.push(name);
    segments.push(namePacked === speciesPacked ? "" : speciesPacked);
    segments.push(packName(set.item));
    segments.push(packName(set.ability));
    segments.push((set.moves || []).map(packName).join(","));
    segments.push(set.nature || "");

    const evs = set.evs || {};
    const evSegment = [evs.hp || "", evs.atk || "", evs.def || "", evs.spa || "", evs.spd || "", evs.spe || ""].join(",");
    segments.push(evSegment === ",,,,," ? "" : evSegment);

    segments.push(set.gender || "");

    const ivs = set.ivs || {};
    const ivSegment = [getIv(ivs, "hp"), getIv(ivs, "atk"), getIv(ivs, "def"), getIv(ivs, "spa"), getIv(ivs, "spd"), getIv(ivs, "spe")].join(",");
    segments.push(ivSegment === ",,,,," ? "" : ivSegment);

    segments.push(set.shiny ? "S" : "");
    segments.push(set.level && set.level !== 100 ? String(set.level) : "");

    const hasExtended = Boolean(set.teraType);
    const happiness = set.happiness != null && set.happiness !== 255 ? String(set.happiness) : "";
    if (hasExtended) {
      segments.push(`${happiness},,,,,${set.teraType}`);
    } else {
      segments.push(happiness);
    }

    return segments.join("|");
  });

  return packedSets.join("]");
}

export const DEFAULT_TEAM_PACKED = packTeam(importExportedTeam(DEFAULT_TEAM_EXPORT));
