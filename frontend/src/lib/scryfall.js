// Direct-to-Scryfall commander search, bypassing our own FastAPI for the most
// common typing-driven lookup in the app (picking a first commander). Scryfall's
// API is CORS-open (access-control-allow-origin: *, verified live) and does not
// require a User-Agent from a real browser — that check only rejects requests
// carrying a generic HTTP-library default UA, which is what real browsers never
// send (and which fetch() cannot override anyway; User-Agent is a forbidden
// header from a page).
//
// Deliberately narrow. Only the unconstrained "first commander" search moves
// here. Partner search (a second commander legal to pair with a chosen first)
// stays on FastAPI's /api/commanders/search — it applies real partner-legality
// rules (mtg_utils/card_classify.py:valid_partner_search): six distinct ability
// kinds (plain partner, "partner with X", a named partner group, Choose a
// Background, a Background card, Doctor's companion), each mapped to a
// different Scryfall filter. Reproducing all six here is real work with real
// risk of a subtle mismatch, for a search that fires far less often than the
// first pick. Not worth it in this pass.

const BASE = "https://api.scryfall.com/cards/search";

// Fixed clauses — never built from user input, so no injection surface here.
const COMMANDER_FILTER = "is:commander -is:digital";

// A bare (unquoted) search term is parsed as Scryfall query syntax, so a typed
// colon ("t:instant", "o:draw") gets read as an operator instead of literal
// text — verified live against the real API: an unquoted "t:instant" returns
// type-line matches, not a name search. Quoting inside name:"..." forces a
// literal substring match (still fuzzy/partial, same as a bare term) and
// neutralizes that: a quoted name:"t:instant" 404s (no match) instead of
// reinterpreting the colon.
function quoteLiteral(s) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Oracle text, ported from mtg_utils/card_classify.py:get_oracle_text — falls
// back to the joined card faces for a DFC/meld card whose top-level
// oracle_text is empty. Keep in sync with the Python version by hand; there is
// no shared source between the two languages.
function oracleText(card) {
  if (card.oracle_text) return card.oracle_text;
  const faces = card.card_faces || [];
  return faces.map((f) => f.oracle_text || "").filter(Boolean).join("\n// \n");
}

// Ported from mtg_utils/card_classify.py:partner_ability. Order matters: the
// specific variants are checked before the bare "partner" keyword, because a
// "partner with X" card also carries plain "partner" in its reminder text
// (CR 702.124j) but pairs only with its named partner (CR 702.124f).
const PARTNER_WITH_RE = /partner with ([^.\n(]+)/i;
const PARTNER_GROUP_RE = /partner\s*[—–-]\s*([^.\n(]+)/i;

function partnerKind(card) {
  const oracle = oracleText(card);
  const low = oracle.toLowerCase();
  const type = card.type_line || "";
  if (low.includes("choose a background")) return "choose_background";
  if (type.includes("Background")) return "background";
  if (PARTNER_WITH_RE.test(oracle)) return "with";
  if (PARTNER_GROUP_RE.test(oracle)) return "group";
  if (low.includes("doctor's companion")) return "doctors_companion";
  if (type.includes("Time Lord Doctor")) return "doctor";
  if (/\bpartner\b/i.test(low)) return "plain";
  return null;
}

/** Search commander-legal cards by (partial) name, straight from Scryfall.
 *
 * Only for the unconstrained case — no partner_of. Shaped to match
 * api.commanders()'s `results` array (name, type_line, color_identity,
 * mana_cost, partner_kind) so callers don't need to branch on which source
 * answered.
 */
export async function searchCommanders(query, { signal } = {}) {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    q: `${COMMANDER_FILTER} name:${quoteLiteral(q)}`,
    // EDHREC order surfaces well-known legends before obscure same-substring
    // matches. The FastAPI path sorts name-asc; this is a deliberate upgrade
    // for a typeahead, not a parity requirement — nothing downstream depends
    // on alphabetical order.
    order: "edhrec",
    unique: "cards",
  });
  let res;
  try {
    res = await fetch(`${BASE}?${params}`, { signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Couldn't reach Scryfall.", { cause: e });
  }
  if (res.status === 404) return []; // Scryfall's "no cards matched" response
  if (!res.ok) throw new Error(`Scryfall search failed (${res.status})`);
  const data = await res.json();
  return (data.data || []).map((c) => ({
    name: c.name,
    type_line: c.type_line || "",
    color_identity: c.color_identity || [],
    mana_cost: c.mana_cost || (c.card_faces || [])[0]?.mana_cost || "",
    partner_kind: partnerKind(c),
  }));
}
