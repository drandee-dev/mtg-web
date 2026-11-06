// Run with: node --test src/lib/deckParser.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deckCardCount, isCommanderFormat, parseDeckText, pullAsides, webFormat } from "./deckParser.js";

// Holiday, 2026-11-06: a pasted Companion section is taken out (it joins Considering),
// including Arena's order, where it sits between Commander and Deck.
test("pullAsides takes Companion sections out of a pasted list", () => {
  const arena = "Commander\n1 Atraxa, Praetors' Voice\n\nCompanion\n1 Jegantha, the Wellspring\n\nDeck\n99 Forest";
  const { rest, aside } = pullAsides(arena);
  assert.deepEqual(aside, ["1 Jegantha, the Wellspring"]);
  assert.ok(!rest.includes("Jegantha") && !/companion/i.test(rest), rest);
  assert.match(rest, /^Commander\n1 Atraxa, Praetors' Voice\n\s*\nDeck\n99 Forest$/);
  const last = pullAsides("98 Plains\nCompanion\n1 Lurrus of the Dream-Den");
  assert.deepEqual(last, { rest: "98 Plains", aside: ["1 Lurrus of the Dream-Den"] });
  assert.deepEqual(pullAsides("1 A\nMaybeboard\n1 B"), { rest: "1 A\nMaybeboard\n1 B", aside: [] });
});

// 2026-11-06 (follow-up): a pasted Sideboard goes to Considering too, as the URL
// importers send it, so a constructed 60 + 15 counts 60, not 75. Arena lists the
// companion under Companion and Sideboard; it is taken once.
test("pullAsides takes a Sideboard section out too, each card once", () => {
  const arena = "Companion\n1 Lurrus of the Dream-Den\n\nDeck\n60 Island\n\nSideboard\n1 Lurrus of the Dream-Den\n14 Pyroblast";
  const { rest, aside } = pullAsides(arena);
  assert.deepEqual(aside, ["1 Lurrus of the Dream-Den", "14 Pyroblast"]);
  assert.equal(parseDeckText(rest).totalCards, 60);
  // Constructed (Andres, "depends on format"): the sideboard stays in the text, so it
  // is exported and checked (Holiday found it exported as main-deck cards when moved),
  // and is only left out of the count.
  const kept = pullAsides(arena, { sideboard: false });
  assert.deepEqual(kept.aside, ["1 Lurrus of the Dream-Den"]);
  assert.match(kept.rest, /Sideboard\n1 Lurrus of the Dream-Den\n14 Pyroblast$/);
  assert.equal(parseDeckText(kept.rest).totalCards, 60);
});

test("isCommanderFormat: Commander, Pauper Commander, unset and retired formats", () => {
  for (const f of ["commander", "paupercommander", "", undefined, "brawl"]) assert.equal(isCommanderFormat(f), true, f);
  for (const f of ["legacy", "modern", "standard", "pauper", "pioneer"]) assert.equal(isCommanderFormat(f), false, f);
});

// 2026-11-06: a companion is not one of the deck's cards, and neither is the
// Considering pile saved under "Maybeboard" (My Decks counted both), nor a sideboard.
test("companion, sideboard and Considering sections are not counted as deck cards", () => {
  const stored = "Commander\n1 Lurrus of the Dream-Den\nDeck\n98 Plains\n1 Sol Ring\n"
    + "Companion\n1 Jegantha, the Wellspring\nMaybeboard\n2 Swords to Plowshares";
  assert.equal(deckCardCount(stored), 100);
  const parsed = parseDeckText("98 Plains\n1 Sol Ring\nCompanion\n1 Jegantha, the Wellspring\nDeck\n1 Island");
  assert.equal(parsed.totalCards, 100);
  assert.ok(!parsed.cards.some((c) => c.name.startsWith("Jegantha")));
  // A constructed 60 + 15 saved before the follow-up: My Decks says 60.
  assert.equal(deckCardCount("Deck\n60 Island\nSideboard\n15 Pyroblast"), 60);
  assert.equal(parseDeckText("60 Island\nSideboard\n15 Pyroblast").totalCards, 60);
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
