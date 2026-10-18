// Thin client for the FastAPI analysis backend. Base URL is configurable so the same
// build works locally (localhost) and in production (your Render URL).

const BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

let _accessToken = "";
export function setAccessToken(token) { _accessToken = token || ""; }

function _headers() {
  const h = { "Content-Type": "application/json" };
  if (_accessToken) h["Authorization"] = `Bearer ${_accessToken}`;
  return h;
}

// A read that cannot reach the server is tried once more after a second, then
// reported: the old four tries with eight-second waits kept a dead server
// looking like "Loading…" for 24s (it was a cold-start allowance from the Render
// days). A read that reaches the server and hangs is cut off at 15s. This client
// never retries a write or an AI call: a dropped connection can come after the
// server has started (and billed) the work, so sending it again could buy it
// twice. (Ask's own fallback, from a failed stream to the plain chat endpoint, is
// a separate and older decision: it does send a second call.)
const GET_TIMEOUT_MS = 15000;
const HEALTH_TIMEOUT_MS = 8000;
const _isNetworkError = (e) => e.message === "Failed to fetch" || e.name === "TypeError";

// JSON.stringify throws a plain TypeError on a circular/non-serializable body
// (e.g. a DOM/Window reference passed by mistake). Done once, up front, so a
// bad body fails clean and immediately with a message that says what is wrong,
// instead of a bare TypeError that reads like a network failure.
function _serialize(body) {
  try {
    return JSON.stringify(body);
  } catch (e) {
    throw new Error(`Request body could not be serialized: ${e.message}`, { cause: e });
  }
}

// How many reads and writes are out right now, for the top progress bar. A
// request counts from the moment it is sent to the moment it settles (retry
// included). Background lookups pass `quiet` (a card picture per card would keep
// the bar lit while a deck loads) and the health check is not counted.
let _inFlight = 0;
const _busyListeners = new Set();
/** Calls `fn(count)` whenever the number of requests in flight changes. Returns an unsubscribe. */
export function subscribeBusy(fn) {
  _busyListeners.add(fn);
  return () => _busyListeners.delete(fn);
}
function _count(delta) {
  _inFlight += delta;
  _busyListeners.forEach((fn) => fn(_inFlight));
}
function _tracked(promise, quiet) {
  if (quiet) return promise;
  _count(1);
  return promise.finally(() => _count(-1));
}

async function _get(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: _accessToken ? { "Authorization": `Bearer ${_accessToken}` } : {},
        signal: AbortSignal.timeout(GET_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
      return res.json();
    } catch (e) {
      if (e.name === "TimeoutError") throw new Error("The server took too long to answer.", { cause: e });
      if (attempt === 0 && _isNetworkError(e)) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw e;
    }
  }
}

async function _post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: _headers(),
    body: _serialize(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
}

const get = (path, params, { quiet = false } = {}) => _tracked(_get(path, params), quiet);
const post = (path, body) => _tracked(_post(path, body), false);

// Same wording the backend sends when a stream ends with no text.
export const EMPTY_REPLY = "The assistant returned an empty reply. Try again.";

export async function postStream(path, body, onChunk) {
  const payload = _serialize(body);
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: _headers(),
    body: payload,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          onChunk(JSON.parse(line.slice(6)));
        } catch { /* skip malformed */ }
      }
    }
  }
}

async function quickGet(path) {
  const res = await fetch(BASE + path, {
    headers: _accessToken ? { "Authorization": `Bearer ${_accessToken}` } : {},
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
}

export const api = {
  health: () => quickGet("/api/health"),
  rules: (params) => get("/api/rules/search", params),
  cards: (params) => get("/api/cards/search", params),
  analyze: (decklist, format) => post("/api/deck/analyze", { decklist, format }),
  exportText: (decklist, format) => post("/api/deck/export", { decklist, format }),
  recommend: (decklist, format) => post("/api/deck/recommend", { decklist, format }),
  budgetSwaps: (decklist, format, threshold) => post("/api/deck/budget-swaps", { decklist, format, threshold }),
  combos: (decklist, format) => post("/api/deck/combos", { decklist, format }),
  composition: (decklist, format) => post("/api/deck/composition", { decklist, format }),
  commanders: (q, partnerOf) => get("/api/commanders/search", { q, partner_of: partnerOf }),
  commanderDirectory: () => get("/api/commanders/directory"),
  commanderSynergies: (name) => get("/api/commanders/synergies", { name }),
  cardImage: (name) => get("/api/cards/image", { name }, { quiet: true }),
  cardPrints: (name) => get("/api/cards/prints", { name }),
  cardPrinting: (set, cn) => get("/api/cards/printing", { set, cn }, { quiet: true }),
  setSearch: (q) => get("/api/sets", { q }),
  massPrinting: (names, sets, rarity) =>
    post("/api/cards/mass-printing", { names, sets, ...(rarity ? { rarity } : {}) }),
  wizardSkeleton: (commander, format, bracket, maxCardPrice) =>
    post("/api/deck/wizard/skeleton", {
      commander, format, ...(bracket != null ? { bracket } : {}),
      ...(maxCardPrice != null ? { max_card_price: maxCardPrice } : {}),
    }),
  wizardNarrate: (commander, category, card_names, decklist) =>
    post("/api/deck/wizard/narrate", { commander, category, card_names, decklist }),
  // wizardChat / rulesAsk / aiCombos were removed 2026-09-20: duplicates of
  // planeswalkerChat, rulesAskStream and combos respectively. The backend
  // routes stay — someone may add a caller later — but nothing reaches them
  // from the UI, and keeping two client methods for one job invited drift.
  rulesAskStream: (question, onChunk) =>
    postStream("/api/rules/ask/stream", { question }, onChunk),
  aiFills: (decklist, format, bracket, goals, maxCardPrice) =>
    post("/api/deck/ai/fills", {
      decklist, format, ...(bracket != null ? { bracket } : {}), ...(goals ? { goals } : {}),
      ...(maxCardPrice != null ? { max_card_price: maxCardPrice } : {}),
    }),
  aiExplain: (decklist, format, card_names, bracket, goals) =>
    post("/api/deck/ai/explain", { decklist, format, card_names, ...(bracket != null ? { bracket } : {}), ...(goals ? { goals } : {}) }),
  aiStrategy: (decklist, format, commander, bracket) =>
    post("/api/deck/ai/strategy", { decklist, format, ...(commander ? { commander } : {}), ...(bracket != null ? { bracket } : {}) }),
  optimize: (decklist, format, goals, focus, recentChanges) =>
    post("/api/deck/optimize", { decklist, format, ...(goals ? { goals } : {}), ...(focus ? { focus } : {}), ...(recentChanges?.length ? { recent_changes: recentChanges } : {}) }),
  // Server gate for AI-named cards: [{ input, name, status, reason }], status ∈
  // ok | in_deck | unknown | illegal | off_color. Max 40 names per call.
  validateCards: (decklist, format, names) =>
    post("/api/deck/validate-cards", { decklist, format, names }),
  importUrl: (url) => post("/api/deck/import-url", { url }),
  importPrecon: (name) => get("/api/deck/import-precon", { name }),
  planeswalkerChat: (messages, decklist, format, commander, bracket, goals, recentChanges) =>
    post("/api/planeswalker/chat", { messages, decklist, format, commander, ...(bracket != null ? { bracket } : {}), ...(goals ? { goals } : {}), ...(recentChanges?.length ? { recent_changes: recentChanges } : {}) }),
  planeswalkerChatStream: (messages, decklist, format, commander, bracket, goals, recentChanges, onChunk) =>
    postStream("/api/planeswalker/chat/stream", { messages, decklist, format, commander, ...(bracket != null ? { bracket } : {}), ...(goals ? { goals } : {}), ...(recentChanges?.length ? { recent_changes: recentChanges } : {}) }, onChunk),
};

// Derive art_crop and border_crop URLs from a normal/small Scryfall image URL.
// The stripped bulk data only keeps normal+small, but Scryfall's CDN paths are
// predictable, so swapping the size segment yields the other variants for free.
// border_crop trims each scan's baked-in black border — scans vary wildly in
// border thickness (e.g. IKO-era), which made same-size cards LOOK different
// sizes in stacks/grid. Rendering border_crop normalizes them (Archidekt does
// the same); consumers keep `image` as an onError fallback.
function _deriveArtCrop(data) {
  const src = data?.image || data?.thumb;
  if (!src) return data;
  const out = { ...data };
  if (!out.art_crop) out.art_crop = src.replace(/\/(normal|small|large)\//, "/art_crop/");
  if (!out.border_crop) out.border_crop = src.replace(/\/(normal|small|large)\//, "/border_crop/");
  return out;
}

// Lazy, cached card-image lookup by name. Each distinct card is fetched at most once
// per session (shared module-level cache), so hovering the same card repeatedly — or
// the same card across tabs — never refetches.
const _imageCache = new Map(); // name(+printing) -> Promise<{found, image, thumb, art_crop, ...}>
export function getCardImage(name, printing = null) {
  const key = printing ? `${name}::${printing.set}/${printing.cn}` : name;
  if (!_imageCache.has(key)) {
    if (printing) {
      // Pinned printing (`Card (SET) 123` in the decklist): oracle data comes
      // from the name lookup, images from the specific scan. Falls back to
      // the default art if the printing lookup fails.
      _imageCache.set(
        key,
        Promise.all([
          getCardImage(name),
          api.cardPrinting(printing.set, printing.cn).catch(() => ({ found: false, failed: true })),
        ]).then(([base, pr]) => {
          // A lookup that failed is not an answer: forget it so the next ask retries.
          if (base?.failed || pr?.failed) _imageCache.delete(key);
          return pr?.found
            ? _deriveArtCrop({
                ...base,
                image: pr.image || base.image,
                thumb: pr.thumb || base.thumb,
                art_crop: pr.art_crop || base.art_crop,
                border_crop: null,
                back_image: pr.back_image || base.back_image,
                price_usd: pr.price_usd ?? base.price_usd,
              })
            : base;
        }),
      );
    } else {
      _imageCache.set(
        key,
        api.cardImage(name)
          .then(_deriveArtCrop)
          .catch(() => {
            // The server answers an unknown card with found:false, so a rejection
            // is the network (or a timeout, or a 5xx), not "no such card". It is
            // not remembered for the session: a blip must not leave a card
            // without its picture until the page is reloaded.
            _imageCache.delete(key);
            return { found: false, image: null, thumb: null, failed: true };
          }),
      );
    }
  }
  return _imageCache.get(key);
}

// Prepend Commander/Deck headers when a commander is set and the raw text doesn't
// already have them. This keeps the textarea clean (just the 99) while the backend
// always receives the structured format it expects.
const _HAS_CMD_HEADER = /^\s*commander\s*$/im;
export function assembleDecklist(rawText, commander) {
  const text = (rawText || "").trim();
  if (!commander || _HAS_CMD_HEADER.test(text)) return text;
  const cmds = commander.split(" && ").filter(Boolean);
  const cmdLines = cmds.map((c) => `1 ${c}`).join("\n");
  return `Commander\n${cmdLines}\nDeck\n${text}`;
}

// A card a person added by hand goes through the same server gate as AI picks,
// but only to warn: an off-color or banned add gets a toast with Undo, never a
// block. `before` is the decklist without the new copy, so the gate doesn't
// just answer "already in the deck". A failed check stays silent.
const _WARN = new Set(["off_color", "illegal"]);
export function warnIfBadAdd({ before, commander, format, name, notify, undo }) {
  api.validateCards(assembleDecklist(before, commander), format, [name])
    .then((r) => {
      const x = r?.results?.[0];
      if (_WARN.has(x?.status)) notify?.(`${x.name}: ${x.reason}`, { label: "Undo", onClick: undo });
    })
    .catch(() => {});
}

// Reverse of assembleDecklist: split a saved decklist that may carry
// "Commander\n1 Name\nDeck\n<rest>" headers (and an optional trailing
// "Maybeboard\n<rest>" section) back into { commander, deckText, maybeboard }.
// A deck can be a commander and nothing else (that is what the first commander
// pick auto-saves), or a commander and a Considering pile: after the trim
// nothing follows "Deck", and "Maybeboard" opens the body.
const _CMD_BLOCK = /^\s*commander\s*\r?\n((?:\s*\d+\s+.+\r?\n)+)\s*deck\s*(?:\r?\n([\s\S]*))?$/i;
const _MAYBE_SPLIT = /(?:^|\r?\n)\s*maybeboard\s*\r?\n/i;
export function disassembleDecklist(text) {
  const raw = (text || "").trim();
  let commander = "";
  let body = raw;
  const m = raw.match(_CMD_BLOCK);
  if (m) {
    const cmds = m[1].trim().split(/\r?\n/)
      .map((l) => l.trim().replace(/^\d+\s+/, "").trim())
      .filter(Boolean);
    commander = cmds.join(" && ");
    body = (m[2] || "").trim();
  }
  let deckText = body;
  let maybeboard = "";
  const parts = body.split(_MAYBE_SPLIT);
  if (parts.length > 1) {
    deckText = parts[0].trim();
    maybeboard = parts.slice(1).join("\n").trim();
  }
  return { commander, deckText, maybeboard };
}

// Build the persisted form including an optional Maybeboard section. Analysis
// calls keep using assembleDecklist (deck only); only saving includes the pile.
export function assembleForStorage(rawText, commander, maybeboard) {
  let out = assembleDecklist(rawText, commander);
  const mb = (maybeboard || "").trim();
  if (mb) out = `${out}\nMaybeboard\n${mb}`;
  return out;
}

// Formats offered in the UI (trimmed per request). Value is the backend format key.
export const FORMATS = [
  ["commander", "Commander"],
  ["paupercommander", "Pauper Commander"],
  ["standard", "Standard"],
  ["modern", "Modern"],
  ["legacy", "Legacy"],
];

// Official WotC Commander brackets. Value is what the backend's _target_bracket
// accepts (1-5); "auto" (null) is rendered separately by each select.
export const BRACKETS = [
  [1, "Exhibition"],
  [2, "Core"],
  [3, "Upgraded"],
  [4, "Optimized"],
  [5, "cEDH"],
];

// Per-card price caps the deck generator offers, in USD. Value is what the
// backend's max_card_price field accepts; "any price" (null) is rendered
// separately by each select.
export const PRICE_CAPS = [1, 2, 5, 10, 20];
