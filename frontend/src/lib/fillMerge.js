// Merge ai/fills suggestions into a generated deck without dropping it below
// the land floor. Every step is one card in, one card out, so the total never
// changes: a fill takes a spare basic while lands sit above the floor, and at
// the floor it displaces the lowest-priority skeleton spell instead.

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

/** Returns { cards, basics, added, cut }. `cards` is the skeleton list in
 *  priority order (tail = lowest), `basics` a Map(name→qty), `proposed` the
 *  fills already in the order they should be tried. Inputs are not mutated.
 *  An added card that displaced a spell carries `displaced: <name>`. */
export function mergeFills({ cards, basics, proposed, thinLabels = [], commanders = [], landFloor = 36 }) {
  const kept = [...cards];
  const nextBasics = new Map(basics);
  const added = [];
  const cut = [];
  const thinRoles = new Set(thinLabels.map((l) => THIN_ROLE[l]).filter(Boolean));
  const have = new Set([...kept.map((c) => c.name), ...commanders].map((n) => n.toLowerCase()));
  let lands = [...nextBasics.values()].reduce((n, q) => n + q, 0)
    + kept.filter((c) => c.category === "Lands").length;

  const takeBasic = () => {
    // Largest pile first, so a multi-colour base thins evenly.
    const [name, q] = [...nextBasics.entries()].reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
    if (!q) return false;
    if (q === 1) nextBasics.delete(name);
    else nextBasics.set(name, q - 1);
    return true;
  };
  const cuttable = (c) => c.category !== "Lands" && !(c.roles || []).some((r) => thinRoles.has(r));

  for (const s of proposed) {
    const name = s.name;
    if (!name || have.has(name.toLowerCase())) continue;
    let displaced = null;
    if (s.category === "Lands") {
      if (!takeBasic()) continue; // land for land; the count is unchanged
    } else if (lands > landFloor && takeBasic()) {
      lands--;
    } else {
      const i = kept.findLastIndex(cuttable);
      if (i < 0) continue;
      displaced = kept.splice(i, 1)[0];
      cut.push({ ...displaced, replacedBy: name });
    }
    have.add(name.toLowerCase());
    added.push({
      name, qty: 1, category: s.category, reason: s.reason || null,
      ...(displaced && { displaced: displaced.name }),
    });
  }
  return { cards: kept, basics: nextBasics, added, cut };
}
