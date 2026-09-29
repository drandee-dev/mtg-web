// Pure deck assembly for DeckGenerator: turn a wizard skeleton into a legal
// 100-card list, then merge ai/fills suggestions into it without dropping it
// below the land floor. Every fill is one card in, one card out, so the total
// never changes: a fill takes a spare basic while lands sit above the floor,
// and at the floor it displaces the least-played skeleton spell instead.

// Skeleton categories that supply the non-land half of the deck, in the order
// they get drawn from.
export const SPELL_CATS = [
  ["staples", "Format staples"],
  ["high_synergy", "High synergy"],
  ["top_cards", "Top cards"],
  ["creatures", "Creatures"],
  ["instants", "Instants"],
  ["sorceries", "Sorceries"],
  ["artifacts", "Artifacts"],
  ["enchantments", "Enchantments"],
];
const STAPLES = "Format staples";

const BASIC_FOR = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const BASIC_NAMES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);
const LAND_TARGET = 36;

function synergyReason(c) {
  if (c.reason) return `EDHREC: ${c.reason}`;
  if (c.synergy != null) return `${Math.round(c.synergy * 100)}% synergy in decks with this commander.`;
  return null;
}

/** Turn a wizard/skeleton response into a legal 100-card list.
 *  Returns { cards: [{name, qty, category, reason, roles, is_land, inclusion}],
 *  basics: Map(name→qty) }. */
export function assembleSkeleton(skeleton, commanderNames) {
  const seen = new Set(commanderNames.map((n) => n.toLowerCase()));
  const spells = [];
  for (const [key, label] of SPELL_CATS) {
    for (const c of skeleton?.[key] || []) {
      const name = c.name;
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      // roles, is_land and inclusion are what mergeFills decides a cut by.
      spells.push({
        name, qty: 1, category: label, reason: synergyReason(c), roles: c.roles || [], is_land: c.is_land,
        inclusion: c.potential_decks && c.num_decks != null ? c.num_decks / c.potential_decks : null,
      });
    }
  }

  const utilLands = [];
  for (const c of [...(skeleton?.suggested_lands || []), ...(skeleton?.lands || [])]) {
    const name = c.name;
    if (!name || BASIC_NAMES.has(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    utilLands.push({ name, qty: 1, category: "Lands", reason: synergyReason(c), is_land: c.is_land });
    if (utilLands.length >= 8) break;
  }

  const slots = 100 - commanderNames.length;
  const chosenSpells = spells.slice(0, slots - LAND_TARGET);
  // A thin skeleton leaves spell slots empty; they become basics for now and
  // ai/fills replaces them with real cards in the next step.
  const landSlots = slots - chosenSpells.length - utilLands.length;

  const basicNames = (skeleton?._colors || []).map((c) => BASIC_FOR[c]).filter(Boolean);
  const basics = new Map();
  if (landSlots > 0) {
    if (!basicNames.length) basics.set("Wastes", landSlots);
    else {
      for (let i = 0; i < landSlots; i++) {
        const n = basicNames[i % basicNames.length];
        basics.set(n, (basics.get(n) || 0) + 1);
      }
    }
  }
  return { cards: [...chosenSpells, ...utilLands], basics };
}

// ai/fills only returns thin categories, labelled as deck_composition labels
// them. Skeleton cards carry roles from backend/app/mtg.py _classify_roles
// (_ROLE_CHECKS / _ORACLE_ROLES); this maps one onto the other.
const THIN_ROLE = {
  "Card draw": "Draw",
  "Spot removal": "Removal",
  "Board wipes": "Board wipe",
  Ramp: "Ramp",
  Lands: "Land",
};

// The backend flags is_land (modal DFCs with a land face included, whatever
// EDHREC category they came from). Older responses and mocks lack it.
const isLand = (c) => c.is_land ?? c.category === "Lands";

/** Returns { cards, basics, added, cut }. `cards` is the skeleton list,
 *  `basics` a Map(name→qty), `proposed` the fills already in the order they
 *  should be tried. Inputs are not mutated. An added card that displaced a
 *  spell carries `displaced: <name>`. */
export function mergeFills({ cards, basics, proposed, thinLabels = [], commanders = [], landFloor = 36 }) {
  const kept = [...cards];
  const nextBasics = new Map(basics);
  const added = [];
  const cut = [];
  const thinRoles = new Set(thinLabels.map((l) => THIN_ROLE[l]).filter(Boolean));
  const have = new Set([...kept.map((c) => c.name), ...commanders].map((n) => n.toLowerCase()));
  let lands = [...nextBasics.values()].reduce((n, q) => n + q, 0) + kept.filter(isLand).length;

  const takeBasic = () => {
    // Largest pile first, so a multi-colour base thins evenly.
    const [name, q] = [...nextBasics.entries()].reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
    if (!q) return false;
    if (q === 1) nextBasics.delete(name);
    else nextBasics.set(name, q - 1);
    return true;
  };
  const cuttable = (c) => !isLand(c) && c.category !== STAPLES && !(c.roles || []).some((r) => thinRoles.has(r));
  // Least played goes first: lowest EDHREC inclusion, no data counting as
  // lowest; a tie goes to the later (lower-priority) card.
  const played = (c) => c.inclusion ?? -1;
  const leastPlayed = () => kept.reduce((best, c, i) =>
    (cuttable(c) && (best < 0 || played(c) <= played(kept[best])) ? i : best), -1);

  for (const s of proposed) {
    const name = s.name;
    if (!name || have.has(name.toLowerCase())) continue;
    let displaced = null;
    if (isLand(s)) {
      if (!takeBasic()) continue; // land for land; the count is unchanged
    } else if (lands > landFloor && takeBasic()) {
      lands--;
    } else {
      const i = leastPlayed();
      if (i < 0) continue;
      displaced = kept.splice(i, 1)[0];
      cut.push({ ...displaced, replacedBy: name });
    }
    have.add(name.toLowerCase());
    added.push({
      name, qty: 1, category: s.category, reason: s.reason || null, is_land: isLand(s),
      ...(displaced && { displaced: displaced.name }),
    });
  }
  return { cards: kept, basics: nextBasics, added, cut };
}
