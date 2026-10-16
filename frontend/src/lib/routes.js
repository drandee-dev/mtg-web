// Addresses ⇄ app state. Pure (no window) so `node --test` can run it.
//
// The four places have real paths: / (decks), /commanders, /commanders/<slug>,
// /cards, /rules. A saved deck is /decks/<id> and the editor with no saved deck
// in it is /new. Links from before paths existed (?tab=rules,
// ?tab=commanders&slug=x, ?tab=deck) still parse, and App replaces them with
// the path on load.

const PLACE_PATHS = new Map([
  ["commanders", "/commanders"],
  ["cards", "/cards"],
  ["rules", "/rules"],
]);
const PATH_PLACES = new Map([...PLACE_PATHS].map(([tab, path]) => [path, tab]));
// Every ?tab= value ever linked to, including two older names for the editor.
const OLD_TABS = new Map([
  ["decks", "decks"], ["deck", "deck"], ["commanders", "commanders"],
  ["rules", "rules"], ["cards", "cards"], ["analyze", "deck"], ["build", "deck"],
]);
// What a share link carries (see App's _loadSharedDeck).
const SHARE_PARAMS = ["deck", "fmt", "cmd"];
// /new?commander=<name>: the commander a new deck starts from.
const SEED_PARAM = "commander";

function _decode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** `{ pathname, search }` (window.location fits) → `{ tab, slug, deckId }`. A
 * path wins over an old ?tab= param; an address the app doesn't know falls
 * back to Decks. */
export function parseLocation({ pathname = "/", search = "" } = {}) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/commanders/")) {
    return { tab: "commanders", slug: _decode(path.slice("/commanders/".length)), deckId: null };
  }
  if (path.startsWith("/decks/")) {
    // Only the first segment is the deck: /decks/<id>/anything is still that deck.
    return { tab: "deck", slug: null, deckId: _decode(path.split("/")[2]) };
  }
  const params = new URLSearchParams(search);
  if (path === "/new") {
    // A commander page's link names the commander to start from. It is only a
    // name to look up: nothing is built until a button is pressed.
    const seed = (params.get(SEED_PARAM) || "").trim();
    const route = { tab: "deck", slug: null, deckId: null };
    return seed && seed.length <= 100 ? { ...route, seed } : route;
  }
  if (PATH_PLACES.has(path)) return { tab: PATH_PLACES.get(path), slug: null, deckId: null };
  const tab = OLD_TABS.get(params.get("tab")) || "decks";
  return { tab, slug: tab === "commanders" ? params.get("slug") || null : null, deckId: null };
}

/** `{ tab, slug, deckId }` → path plus query. `search` is the current query
 * string: everything in it except the old tab/slug params is kept. A share
 * link's ?deck= rides along until its deck is saved, so a reload before then
 * still opens it; a saved deck's address is the deck, and drops it. */
export function buildPath({ tab, slug = null, deckId = null, seed = null }, search = "") {
  const params = new URLSearchParams(search);
  params.delete("tab");
  params.delete("slug");
  // The commander for a new deck belongs to /new alone: left in the query it
  // would ride along to every later address, and be picked again on the way back.
  params.delete(SEED_PARAM);
  let path = PLACE_PATHS.get(tab) || "/";
  if (tab === "commanders" && slug) path = `/commanders/${encodeURIComponent(slug)}`;
  if (tab === "deck") {
    path = deckId ? `/decks/${encodeURIComponent(deckId)}` : "/new";
    if (deckId) for (const p of SHARE_PARAMS) params.delete(p);
    else if (seed) params.set(SEED_PARAM, seed);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Which saved deck a /decks/<id> address means, given the deck list on hand.
 * "wait" until the list is the right one: before the sign-in check settles the
 * app reads as signed out, and the list it has then is this browser's, not the
 * account's. `decksLoadedFor` is the user id the list was loaded for (null for
 * this browser's own decks, undefined before any list has arrived). */
export function resolveDeckRoute({ deckId, decks, decksLoadedFor, authReady, userId }) {
  if (!authReady || decksLoadedFor !== userId) return { status: "wait" };
  const deck = decks.find((d) => d.id === deckId);
  return deck ? { status: "found", deck } : { status: "missing" };
}

/** The address shown while a deck's Playtest is open. It is a layer over the
 * deck, not a route: opened on its own (a reload, a pasted link) it parses as
 * the deck, and App replaces it with the deck's address. */
export function playtestPath(deckId) {
  return `/decks/${encodeURIComponent(deckId)}/playtest`;
}
