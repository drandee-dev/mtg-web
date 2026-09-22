// Run with: node --test src/lib/collection.test.js
// No framework — node:test is stdlib, and this logic (CSV parsing, name
// matching, malformed-row handling) is exactly the kind of thing a mutation
// would silently break: a parser with no test is unfinished.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCollectionCsv, buildOwnedIndex, ownedQuantity, normalizeCardName } from "./collection.js";

test("parses name,set,quantity rows and skips the header", () => {
  const { rows, skipped } = parseCollectionCsv(
    "name,set,quantity\nSol Ring,cmr,2\nCommand Tower,40k,1",
  );
  assert.equal(rows.length, 2);
  assert.equal(skipped, 0);
  assert.deepEqual(rows[0], { name: "Sol Ring", set: "cmr", quantity: 2 });
});

test("handles a quoted name with an embedded comma and an empty set field", () => {
  const { rows } = parseCollectionCsv('"Nykthos, Shrine to Nyx",,2');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Nykthos, Shrine to Nyx");
  assert.equal(rows[0].set, "");
  assert.equal(rows[0].quantity, 2);
});

test("skips a row with no name instead of throwing", () => {
  const { rows, skipped } = parseCollectionCsv("Sol Ring,cmr,1\n,,3\nCommand Tower,,1");
  assert.equal(rows.length, 2);
  assert.equal(skipped, 1);
});

test("a missing or unparseable quantity defaults to 1 rather than dropping the row", () => {
  const { rows } = parseCollectionCsv("Sol Ring,cmr\nArcane Signet,,abc");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].quantity, 1);
  assert.equal(rows[1].quantity, 1);
});

test("owned index sums duplicate printings of the same card", () => {
  const { rows } = parseCollectionCsv("Island,mkm,3\nIsland,dsk,2");
  const idx = buildOwnedIndex(rows);
  assert.equal(ownedQuantity("Island", idx), 5);
});

test("exact-key match never lets a short name match inside a longer one", () => {
  const idx = buildOwnedIndex(parseCollectionCsv("Island of the Desert,,1").rows);
  // Owns the long name only — "Island" alone must read as un-owned.
  assert.equal(ownedQuantity("Island", idx), 0);
  assert.equal(ownedQuantity("Island of the Desert", idx), 1);
});

test("normalization folds accents and case so ASCII and canonical spellings match", () => {
  const idx = buildOwnedIndex(parseCollectionCsv("Lim-Dul's Vault,,1").rows);
  assert.equal(ownedQuantity("Lim-Dûl's Vault", idx), 1); // Lim-Dûl's Vault
  assert.equal(normalizeCardName("Lim-Dûl's Vault"), normalizeCardName("Lim-Dul's Vault"));
});

test("an unowned card reads as 0, not undefined or a throw", () => {
  const idx = buildOwnedIndex(parseCollectionCsv("Sol Ring,,1").rows);
  assert.equal(ownedQuantity("Counterspell", idx), 0);
});

test("an explicit quantity of 0 is kept as 0, not defaulted to owning 1", () => {
  const { rows } = parseCollectionCsv("Sol Ring,cmr,0");
  assert.equal(rows[0].quantity, 0);
  const idx = buildOwnedIndex(rows);
  assert.equal(ownedQuantity("Sol Ring", idx), 0);
});

test("a quoted name that itself starts and ends with a literal quote round-trips", () => {
  // "Ach! Hans, Run!" is a real card name; a spec-compliant CSV export of a
  // field containing both quotes and a comma doubles the inner quotes.
  const { rows } = parseCollectionCsv('"""Ach! Hans, Run!""",,1');
  assert.equal(rows[0].name, '"Ach! Hans, Run!"');
  const idx = buildOwnedIndex(rows);
  assert.equal(ownedQuantity('"Ach! Hans, Run!"', idx), 1);
});
