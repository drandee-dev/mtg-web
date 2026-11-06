// Run with: node --test src/lib/deckParser.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deckCardCount, parseDeckText, webFormat } from "./deckParser.js";

// 2026-11-06: a companion is not one of the deck's cards, and neither is the
// Considering pile saved under "Maybeboard" (My Decks counted both).
test("companion and Considering sections are not counted as deck cards", () => {
  const stored = "Commander\n1 Lurrus of the Dream-Den\nDeck\n98 Plains\n1 Sol Ring\n"
    + "Companion\n1 Jegantha, the Wellspring\nMaybeboard\n2 Swords to Plowshares";
  assert.equal(deckCardCount(stored), 100);
  const parsed = parseDeckText("98 Plains\n1 Sol Ring\nCompanion\n1 Jegantha, the Wellspring\nDeck\n1 Island");
  assert.equal(parsed.totalCards, 100);
  assert.ok(!parsed.cards.some((c) => c.name.startsWith("Jegantha")));
  // Sideboard lines still count, as the backend folds them in for Commander.
  assert.equal(deckCardCount("Deck\n59 Island\nSideboard\n1 Plains"), 60);
});

test("retired Brawl formats open as Commander; others pass through", () => {
  assert.equal(webFormat("brawl"), "commander");
  assert.equal(webFormat("historic_brawl"), "commander");
  for (const f of ["commander", "paupercommander", "standard", "modern", "legacy"]) assert.equal(webFormat(f), f);
  // Falsy stays falsy, so each caller keeps its own default.
  assert.equal(webFormat(""), "");
  assert.equal(webFormat(undefined), undefined);
  // Object's own property names are not formats: a ?fmt= link must stay a string.
  for (const f of ["constructor", "toString", "__proto__", "hasOwnProperty"]) assert.equal(webFormat(f), f);
});
