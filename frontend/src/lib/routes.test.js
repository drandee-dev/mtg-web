// Run with: node --test src/lib/routes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocation, buildPath } from "./routes.js";

const parse = (url) => {
  const [pathname, query] = url.split("?");
  return parseLocation({ pathname, search: query ? `?${query}` : "" });
};

test("each place has a path", () => {
  assert.deepEqual(parse("/"), { tab: "decks", slug: null });
  assert.deepEqual(parse("/commanders"), { tab: "commanders", slug: null });
  assert.deepEqual(parse("/commanders/atraxa-praetors-voice"), { tab: "commanders", slug: "atraxa-praetors-voice" });
  assert.deepEqual(parse("/cards"), { tab: "cards", slug: null });
  assert.deepEqual(parse("/rules"), { tab: "rules", slug: null });
});

test("a trailing slash is the same address", () => {
  assert.deepEqual(parse("/rules/"), { tab: "rules", slug: null });
  assert.deepEqual(parse("/commanders/"), { tab: "commanders", slug: null });
  assert.deepEqual(parse("/commanders/atraxa-praetors-voice/"), { tab: "commanders", slug: "atraxa-praetors-voice" });
});

test("the deck editor stays on /?tab=deck", () => {
  assert.deepEqual(parse("/?tab=deck"), { tab: "deck", slug: null });
  assert.equal(buildPath({ tab: "deck" }), "/?tab=deck");
});

test("old ?tab= links still parse", () => {
  assert.deepEqual(parse("/?tab=rules"), { tab: "rules", slug: null });
  assert.deepEqual(parse("/?tab=cards"), { tab: "cards", slug: null });
  assert.deepEqual(parse("/?tab=commanders"), { tab: "commanders", slug: null });
  assert.deepEqual(parse("/?tab=commanders&slug=atraxa-praetors-voice"), { tab: "commanders", slug: "atraxa-praetors-voice" });
  assert.deepEqual(parse("/?tab=analyze"), { tab: "deck", slug: null });
  assert.deepEqual(parse("/?tab=build"), { tab: "deck", slug: null });
});

test("an old link is replaced by its path", () => {
  const moved = (url) => buildPath(parse(url), url.slice(url.indexOf("?")));
  assert.equal(moved("/?tab=rules"), "/rules");
  assert.equal(moved("/?tab=cards"), "/cards");
  assert.equal(moved("/?tab=decks"), "/");
  assert.equal(moved("/?tab=commanders&slug=atraxa-praetors-voice"), "/commanders/atraxa-praetors-voice");
});

test("unknown input falls back to Decks", () => {
  assert.deepEqual(parse("/?tab=nope"), { tab: "decks", slug: null });
  // Object.prototype names must not read as tabs.
  assert.deepEqual(parse("/?tab=constructor"), { tab: "decks", slug: null });
  assert.deepEqual(parse("/nowhere"), { tab: "decks", slug: null });
  assert.deepEqual(parse("/?slug=orphan"), { tab: "decks", slug: null });
  assert.deepEqual(parseLocation(), { tab: "decks", slug: null });
});

test("a path wins over an old param", () => {
  assert.deepEqual(parse("/rules?tab=cards"), { tab: "rules", slug: null });
  assert.equal(buildPath({ tab: "rules" }, "?tab=cards&slug=x"), "/rules");
});

test("a malformed slug does not throw", () => {
  assert.deepEqual(parse("/commanders/%E0%A4%A"), { tab: "commanders", slug: "%E0%A4%A" });
});

test("build keeps other params, such as a share link's deck", () => {
  assert.equal(buildPath({ tab: "deck" }, "?deck=QUJD&fmt=commander"), "/?deck=QUJD&fmt=commander&tab=deck");
  // An existing tab=deck keeps its position, so an unchanged address compares equal.
  assert.equal(buildPath({ tab: "deck" }, "?tab=deck&deck=QUJD"), "/?tab=deck&deck=QUJD");
  assert.equal(buildPath({ tab: "rules" }, "?deck=QUJD&tab=deck"), "/rules?deck=QUJD");
});

test("every route survives build then parse", () => {
  const routes = [
    { tab: "decks", slug: null },
    { tab: "deck", slug: null },
    { tab: "commanders", slug: null },
    { tab: "commanders", slug: "atraxa-praetors-voice" },
    { tab: "cards", slug: null },
    { tab: "rules", slug: null },
  ];
  for (const route of routes) assert.deepEqual(parse(buildPath(route)), route);
  // A slug is only part of the address on Commanders.
  assert.equal(buildPath({ tab: "rules", slug: "atraxa-praetors-voice" }), "/rules");
});
