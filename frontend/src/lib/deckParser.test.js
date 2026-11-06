// Run with: node --test src/lib/deckParser.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deckCardCount, parseDeckText, pullCompanions, webFormat } from "./deckParser.js";

// Holiday, 2026-11-06: a pasted Companion section is taken out (it joins Considering),
// including Arena's order, where it sits between Commander and Deck.
test("pullCompanions takes Companion sections out of a pasted list", () => {
  const arena = "Commander\n1 Atraxa, Praetors' Voice\n\nCompanion\n1 Jegantha, the Wellspring\n\nDeck\n99 Forest";
  const { rest, companions } = pullCompanions(arena);
  assert.deepEqual(companions, ["1 Jegantha, the Wellspring"]);
  assert.ok(!rest.includes("Jegantha") && !/companion/i.test(rest), rest);
  assert.match(rest, /^Commander\n1 Atraxa, Praetors' Voice\n\s*\nDeck\n99 Forest$/);
  const last = pullCompanions("98 Plains\nCompanion\n1 Lurrus of the Dream-Den");
  assert.deepEqual(last, { rest: "98 Plains", companions: ["1 Lurrus of the Dream-Den"] });
  assert.deepEqual(pullCompanions("1 A\nMaybeboard\n1 B"), { rest: "1 A\nMaybeboard\n1 B", companions: [] });
});

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
