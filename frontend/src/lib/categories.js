// Every card-list category the backend sends (EDHREC lists plus the wizard's own),
// in display order. Each screen picks the ones it shows; the order and labels live here.
export const CATEGORIES = [
  ["staples", "Format staples"],
  ["suggested_lands", "Mana base"],
  ["high_synergy", "High synergy"],
  ["top_cards", "Top cards"],
  ["creatures", "Creatures"],
  ["instants", "Instants"],
  ["sorceries", "Sorceries"],
  ["artifacts", "Artifacts"],
  ["mana_artifacts", "Mana artifacts"],
  ["enchantments", "Enchantments"],
  ["planeswalkers", "Planeswalkers"],
  ["battles", "Battles"],
  ["budget_picks", "Budget picks"], // only sent under a price cap
  ["lands", "Lands"],
];

/** The [key, label] pairs for these keys, in CATEGORIES order. */
export const pickCategories = (...keys) => CATEGORIES.filter(([k]) => keys.includes(k));
