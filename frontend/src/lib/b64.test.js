// Run with: node --test src/lib/b64.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { b64encode, b64decode } from "./b64.js";

test("plain text round-trips", () => {
  const text = "1 Sol Ring\n1 Lightning Bolt";
  assert.equal(b64decode(b64encode(text)), text);
});

test("accented card names round-trip", () => {
  const text = "1 Jötun Grunt\n1 Æther Vial\n1 Lim-Dûl's Vault";
  assert.equal(b64decode(b64encode(text)), text);
});

test("characters past Latin-1 round-trip, where plain btoa throws", () => {
  const text = "1 Kongming, “Sleeping Dragon”\n1 Ūro, Titan of Nature's Wrath";
  assert.throws(() => btoa(text));
  assert.equal(b64decode(b64encode(text)), text);
});

test("an empty string round-trips", () => {
  assert.equal(b64decode(b64encode("")), "");
});
