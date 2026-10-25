// Run with: node --test src/lib/deckParser.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { webFormat } from "./deckParser.js";

test("retired Brawl formats open as Commander; others pass through", () => {
  assert.equal(webFormat("brawl"), "commander");
  assert.equal(webFormat("historic_brawl"), "commander");
  for (const f of ["commander", "paupercommander", "standard", "modern", "legacy"]) assert.equal(webFormat(f), f);
  // Falsy stays falsy, so each caller keeps its own default.
  assert.equal(webFormat(""), "");
  assert.equal(webFormat(undefined), undefined);
});
