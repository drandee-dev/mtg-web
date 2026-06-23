const TYPE_ORDER = [
  "Creature",
  "Planeswalker",
  "Instant",
  "Sorcery",
  "Enchantment",
  "Artifact",
  "Land",
];

const SECTION_HEADERS = /^\s*(commander|deck|sideboard|maybeboard)\s*$/i;

export function parseDeckText(deckText) {
  const lines = (deckText || "").split("\n");
  const cards = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || SECTION_HEADERS.test(trimmed)) continue;
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const qty = parseInt(match[1], 10) || 1;
    const name = match[2].trim();
    const existing = cards.find((c) => c.name === name);
    if (existing) {
      existing.qty += qty;
    } else {
      cards.push({ name, qty });
    }
  }
  return { cards, totalCards: cards.reduce((s, c) => s + c.qty, 0) };
}

export function groupByMtgType(cards, typeMap) {
  const groups = {};
  for (const card of cards) {
    const typeLine = (typeMap[card.name] || "").toLowerCase();
    let bucket = "Other";
    for (const t of TYPE_ORDER) {
      if (typeLine.includes(t.toLowerCase())) {
        bucket = t;
        break;
      }
    }
    (groups[bucket] ??= []).push(card);
  }
  const ordered = {};
  for (const t of TYPE_ORDER) {
    if (groups[t]) ordered[t] = groups[t].sort((a, b) => a.name.localeCompare(b.name));
  }
  if (groups.Other) ordered.Other = groups.Other.sort((a, b) => a.name.localeCompare(b.name));
  return ordered;
}

export { TYPE_ORDER };
