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

function _typeBucket(typeLine) {
  const tl = (typeLine || "").toLowerCase();
  for (const t of TYPE_ORDER) {
    if (tl.includes(t.toLowerCase())) return t;
  }
  return "Other";
}

export function groupByMtgType(cards, typeMap) {
  const groups = {};
  for (const card of cards) {
    (groups[_typeBucket(typeMap[card.name])] ??= []).push(card);
  }
  const ordered = {};
  for (const t of TYPE_ORDER) {
    if (groups[t]) ordered[t] = groups[t].sort((a, b) => a.name.localeCompare(b.name));
  }
  if (groups.Other) ordered.Other = groups.Other.sort((a, b) => a.name.localeCompare(b.name));
  return ordered;
}

const COLOR_ORDER = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Land"];
const COLOR_NAMES = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

function _colorBucket(colorIdentity, typeLine) {
  if ((typeLine || "").toLowerCase().includes("land")) return "Land";
  const ci = colorIdentity || [];
  if (ci.length === 0) return "Colorless";
  if (ci.length > 1) return "Multicolor";
  return COLOR_NAMES[ci[0]] || "Colorless";
}

const RARITY_ORDER = ["Mythic", "Rare", "Uncommon", "Common", "Special", "Other"];
const PRICE_BUCKETS = [
  [0, 0.5, "Under $0.50"],
  [0.5, 2, "$0.50 – $2"],
  [2, 5, "$2 – $5"],
  [5, 15, "$5 – $15"],
  [15, 50, "$15 – $50"],
  [50, Infinity, "$50+"],
];

function _priceBucket(price) {
  if (price == null) return "No price";
  for (const [lo, hi, label] of PRICE_BUCKETS) {
    if (price >= lo && price < hi) return label;
  }
  return "No price";
}

// Generic grouping by mode: "type" | "role" | "cmc" | "color" | "rarity" | "price".
// metaMap: name -> { type_line, roles, cmc, color_identity, rarity, price_usd }
export function groupCards(cards, mode, metaMap) {
  if (mode === "type") {
    return groupByMtgType(cards, Object.fromEntries(
      Object.entries(metaMap).map(([n, m]) => [n, m?.type_line || ""])
    ));
  }

  const groups = {};
  for (const card of cards) {
    const m = metaMap[card.name] || {};
    let bucket;
    if (mode === "role") {
      const firstRole = m.roles?.length > 0 ? m.roles[0] : null;
      bucket = firstRole || _typeBucket(m.type_line);
    } else if (mode === "cmc") {
      const c = Math.floor(m.cmc ?? 0);
      bucket = (m.type_line || "").toLowerCase().includes("land") ? "Lands" : `MV ${c >= 7 ? "7+" : c}`;
    } else if (mode === "color") {
      bucket = _colorBucket(m.color_identity, m.type_line);
    } else if (mode === "rarity") {
      const r = (m.rarity || "common");
      bucket = r.charAt(0).toUpperCase() + r.slice(1);
    } else if (mode === "price") {
      bucket = _priceBucket(m.price_usd);
    } else {
      bucket = "Other";
    }
    (groups[bucket] ??= []).push(card);
  }

  // Ordering per mode
  let order;
  if (mode === "color") order = COLOR_ORDER;
  else if (mode === "cmc") order = ["MV 0", "MV 1", "MV 2", "MV 3", "MV 4", "MV 5", "MV 6", "MV 7+", "Lands"];
  else if (mode === "rarity") order = RARITY_ORDER;
  else if (mode === "price") order = PRICE_BUCKETS.map(([,, l]) => l).concat(["No price"]);
  else order = null;

  const keys = order
    ? order.filter((k) => groups[k])
    : Object.keys(groups).sort();
  // append any buckets not in the predefined order
  for (const k of Object.keys(groups)) if (!keys.includes(k)) keys.push(k);

  const ordered = {};
  for (const k of keys) {
    ordered[k] = groups[k].sort((a, b) => a.name.localeCompare(b.name));
  }
  return ordered;
}

export { TYPE_ORDER };
