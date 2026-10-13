// Run with: node --test src/lib/routes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocation, buildPath, resolveDeckRoute } from "./routes.js";

const parse = (url) => {
  const [pathname, query] = url.split("?");
  return parseLocation({ pathname, search: query ? `?${query}` : "" });
};
const at = (tab, slug = null, deckId = null) => ({ tab, slug, deckId });

test("each place has a path", () => {
  assert.deepEqual(parse("/"), at("decks"));
  assert.deepEqual(parse("/commanders"), at("commanders"));
  assert.deepEqual(parse("/commanders/atraxa-praetors-voice"), at("commanders", "atraxa-praetors-voice"));
  assert.deepEqual(parse("/cards"), at("cards"));
  assert.deepEqual(parse("/rules"), at("rules"));
});

test("a trailing slash is the same address", () => {
  assert.deepEqual(parse("/rules/"), at("rules"));
  assert.deepEqual(parse("/commanders/"), at("commanders"));
  assert.deepEqual(parse("/commanders/atraxa-praetors-voice/"), at("commanders", "atraxa-praetors-voice"));
  assert.deepEqual(parse("/decks/abc-123/"), at("deck", null, "abc-123"));
  assert.deepEqual(parse("/new/"), at("deck"));
});

test("a saved deck is /decks/<id> and the empty editor is /new", () => {
  assert.deepEqual(parse("/decks/abc-123"), at("deck", null, "abc-123"));
  assert.deepEqual(parse("/new"), at("deck"));
  assert.equal(buildPath(at("deck", null, "abc-123")), "/decks/abc-123");
  assert.equal(buildPath(at("deck")), "/new");
  // A local id from before crypto.randomUUID, and one that needs encoding.
  assert.deepEqual(parse(buildPath(at("deck", null, "id_17_x.y"))), at("deck", null, "id_17_x.y"));
  assert.deepEqual(parse(buildPath(at("deck", null, "a b/c"))), at("deck", null, "a b/c"));
});

test("only the first segment after /decks/ is the deck", () => {
  assert.deepEqual(parse("/decks/abc-123/playtest"), at("deck", null, "abc-123"));
  // No id at all is not a deck address.
  assert.deepEqual(parse("/decks"), at("decks"));
  assert.deepEqual(parse("/decks/"), at("decks"));
});

test("old ?tab= links still parse", () => {
  assert.deepEqual(parse("/?tab=rules"), at("rules"));
  assert.deepEqual(parse("/?tab=cards"), at("cards"));
  assert.deepEqual(parse("/?tab=commanders"), at("commanders"));
  assert.deepEqual(parse("/?tab=commanders&slug=atraxa-praetors-voice"), at("commanders", "atraxa-praetors-voice"));
  assert.deepEqual(parse("/?tab=deck"), at("deck"));
  assert.deepEqual(parse("/?tab=analyze"), at("deck"));
  assert.deepEqual(parse("/?tab=build"), at("deck"));
});

test("an old link is replaced by its path", () => {
  const moved = (url) => buildPath(parse(url), url.slice(url.indexOf("?")));
  assert.equal(moved("/?tab=rules"), "/rules");
  assert.equal(moved("/?tab=cards"), "/cards");
  assert.equal(moved("/?tab=decks"), "/");
  assert.equal(moved("/?tab=deck"), "/new");
  assert.equal(moved("/?tab=commanders&slug=atraxa-praetors-voice"), "/commanders/atraxa-praetors-voice");
});

test("unknown input falls back to Decks", () => {
  assert.deepEqual(parse("/?tab=nope"), at("decks"));
  // Object.prototype names must not read as tabs.
  assert.deepEqual(parse("/?tab=constructor"), at("decks"));
  assert.deepEqual(parse("/nowhere"), at("decks"));
  assert.deepEqual(parse("/?slug=orphan"), at("decks"));
  assert.deepEqual(parseLocation(), at("decks"));
});

test("a path wins over an old param", () => {
  assert.deepEqual(parse("/rules?tab=cards"), at("rules"));
  assert.deepEqual(parse("/decks/abc-123?tab=rules"), at("deck", null, "abc-123"));
  assert.equal(buildPath({ tab: "rules" }, "?tab=cards&slug=x"), "/rules");
});

test("a malformed slug or id does not throw", () => {
  assert.deepEqual(parse("/commanders/%E0%A4%A"), at("commanders", "%E0%A4%A"));
  assert.deepEqual(parse("/decks/%E0%A4%A"), at("deck", null, "%E0%A4%A"));
});

test("a share link's params ride along until its deck is saved", () => {
  // Not saved yet: a reload has to find the deck in the address.
  assert.equal(buildPath(at("deck"), "?deck=QUJD&fmt=commander&cmd=X"), "/new?deck=QUJD&fmt=commander&cmd=X");
  assert.equal(buildPath(at("rules"), "?deck=QUJD&tab=deck"), "/rules?deck=QUJD");
  // Saved: the address is the deck.
  assert.equal(buildPath(at("deck", null, "abc-123"), "?deck=QUJD&fmt=commander&cmd=X"), "/decks/abc-123");
  // Anything else in the query is not the share link's to drop.
  assert.equal(buildPath(at("deck", null, "abc-123"), "?deck=QUJD&ref=x"), "/decks/abc-123?ref=x");
});

test("every route survives build then parse", () => {
  const routes = [
    at("decks"),
    at("deck"),
    at("deck", null, "abc-123"),
    at("commanders"),
    at("commanders", "atraxa-praetors-voice"),
    at("cards"),
    at("rules"),
  ];
  for (const route of routes) assert.deepEqual(parse(buildPath(route)), route);
  // A slug is only part of the address on Commanders, a deck id only on a deck.
  assert.equal(buildPath(at("rules", "atraxa-praetors-voice", "abc-123")), "/rules");
});

test("a deck address waits for the right deck list before it can be missing", () => {
  const deck = { id: "abc-123", name: "Mine" };
  const mine = { deckId: "abc-123", decks: [deck], authReady: true };
  // Signed out (or no accounts at all): this browser's list, loaded for null.
  assert.deepEqual(resolveDeckRoute({ ...mine, decksLoadedFor: null, userId: null }), { status: "found", deck });
  assert.deepEqual(resolveDeckRoute({ ...mine, decks: [], decksLoadedFor: null, userId: null }), { status: "missing" });
  // Auth not ready: the app reads as signed out and holds this browser's list,
  // which is the wrong one for a signed-in user. Wait, even though it "loaded".
  assert.deepEqual(resolveDeckRoute({ ...mine, decks: [], authReady: false, decksLoadedFor: null, userId: null }), { status: "wait" });
  // Signed in, account's list not here yet: still this browser's list.
  assert.deepEqual(resolveDeckRoute({ ...mine, decks: [], decksLoadedFor: null, userId: "u1" }), { status: "wait" });
  // Nothing loaded at all.
  assert.deepEqual(resolveDeckRoute({ ...mine, decks: [], decksLoadedFor: undefined, userId: null }), { status: "wait" });
  // The account's list arrived.
  assert.deepEqual(resolveDeckRoute({ ...mine, decksLoadedFor: "u1", userId: "u1" }), { status: "found", deck });
  assert.deepEqual(resolveDeckRoute({ ...mine, deckId: "gone", decksLoadedFor: "u1", userId: "u1" }), { status: "missing" });
});
