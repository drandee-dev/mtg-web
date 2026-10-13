// Addresses ⇄ app state. Pure (no window) so `node --test` can run it.
//
// The four places have real paths: / (decks), /commanders, /commanders/<slug>,
// /cards, /rules. The deck editor stays on /?tab=deck until decks get their own
// addresses. Links from before paths existed (?tab=rules, ?tab=commanders&slug=x)
// still parse, and App replaces them with the path on load.

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

function _decode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** `{ pathname, search }` (window.location fits) → `{ tab, slug }`. A path wins
 * over an old ?tab= param; an address the app doesn't know falls back to Decks. */
export function parseLocation({ pathname = "/", search = "" } = {}) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/commanders/")) {
    return { tab: "commanders", slug: _decode(path.slice("/commanders/".length)) };
  }
  if (PATH_PLACES.has(path)) return { tab: PATH_PLACES.get(path), slug: null };
  const params = new URLSearchParams(search);
  const tab = OLD_TABS.get(params.get("tab")) || "decks";
  return { tab, slug: tab === "commanders" ? params.get("slug") || null : null };
}

/** `{ tab, slug }` → path plus query. `search` is the current query string:
 * everything in it except the old tab/slug params is kept, because a share
 * link's ?deck= stays in the address on purpose (see App's _loadSharedDeck). */
export function buildPath({ tab, slug = null }, search = "") {
  const params = new URLSearchParams(search);
  if (tab === "deck") params.set("tab", "deck");
  else params.delete("tab");
  params.delete("slug");
  const path = tab === "commanders" && slug
    ? `/commanders/${encodeURIComponent(slug)}`
    : PLACE_PATHS.get(tab) || "/";
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
