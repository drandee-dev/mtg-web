// Shared test data — realistic deck contents for E2E tests.
// Uses well-known Commander cards so backend card lookups succeed.

export const TEST_COMMANDER = "Atraxa, Praetors' Voice";

export const TEST_DECK_LINES = [
  "1 Sol Ring",
  "1 Command Tower",
  "1 Arcane Signet",
  "1 Swords to Plowshares",
  "1 Counterspell",
  "1 Cultivate",
  "1 Kodama's Reach",
  "1 Rhystic Study",
  "1 Smothering Tithe",
  "1 Deepglow Skate",
];

export const TEST_DECK_TEXT = TEST_DECK_LINES.join("\n");

export const TEST_DECK_STORAGE = {
  id: "test-deck-1",
  name: "Test Atraxa",
  format: "commander",
  decklist_text: `Commander\n1 ${TEST_COMMANDER}\n\nDeck\n${TEST_DECK_TEXT}`,
};

export const SEARCH_QUERIES = {
  common: "Lightning Bolt",
  commander: "Atraxa",
  multiword: "Swords to Plowshares",
};
