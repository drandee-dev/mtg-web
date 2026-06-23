// Thin client for the FastAPI analysis backend. Base URL is configurable so the same
// build works locally (localhost) and in production (your Render URL).

const BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

let _accessToken = "";
export function setAccessToken(token) { _accessToken = token || ""; }

function _headers() {
  const h = { "Content-Type": "application/json" };
  if (_accessToken) h["Authorization"] = `Bearer ${_accessToken}`;
  return h;
}

async function get(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: _accessToken ? { "Authorization": `Bearer ${_accessToken}` } : {} });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
      return res.json();
    } catch (e) {
      if (attempt < 3 && (e.message === "Failed to fetch" || e.name === "TypeError")) {
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      throw e;
    }
  }
}

async function post(path, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        method: "POST",
        headers: _headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
      return res.json();
    } catch (e) {
      if (attempt < 3 && (e.message === "Failed to fetch" || e.name === "TypeError")) {
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      throw e;
    }
  }
}

export async function postStream(path, body, onChunk) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: _headers(),
    body: JSON.stringify(body),
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
  const res = await fetch(BASE + path, { headers: _accessToken ? { "Authorization": `Bearer ${_accessToken}` } : {} });
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
  cardImage: (name) => get("/api/cards/image", { name }),
  wizardSkeleton: (commander, format, bracket) =>
    post("/api/deck/wizard/skeleton", { commander, format, ...(bracket != null ? { bracket } : {}) }),
  wizardNarrate: (commander, category, card_names, decklist) =>
    post("/api/deck/wizard/narrate", { commander, category, card_names, decklist }),
  wizardChat: (commander, messages, decklist, format, bracket) =>
    post("/api/deck/wizard/chat", { commander, messages, decklist, format, ...(bracket != null ? { bracket } : {}) }),
  rulesAsk: (question) =>
    post("/api/rules/ask", { question }),
  rulesAskStream: (question, onChunk) =>
    postStream("/api/rules/ask/stream", { question }, onChunk),
  aiCuts: (decklist, format, bracket) =>
    post("/api/deck/ai/cuts", { decklist, format, ...(bracket != null ? { bracket } : {}) }),
  aiFills: (decklist, format, bracket) =>
    post("/api/deck/ai/fills", { decklist, format, ...(bracket != null ? { bracket } : {}) }),
  aiExplain: (decklist, format, card_names, bracket) =>
    post("/api/deck/ai/explain", { decklist, format, card_names, ...(bracket != null ? { bracket } : {}) }),
  aiCombos: (decklist, format, combos, near_misses, bracket) =>
    post("/api/deck/ai/combos", { decklist, format, combos, near_misses, ...(bracket != null ? { bracket } : {}) }),
  planeswalkerChat: (messages, decklist, format, commander, bracket) =>
    post("/api/planeswalker/chat", { messages, decklist, format, commander, ...(bracket != null ? { bracket } : {}) }),
};

// Derive the art_crop URL from a normal/small Scryfall image URL. The stripped bulk
// data only keeps normal+small, but Scryfall's CDN paths are predictable, so swapping
// the size segment yields the art crop without storing it.
function _deriveArtCrop(data) {
  if (data?.art_crop) return data;
  const src = data?.image || data?.thumb;
  if (src) {
    return { ...data, art_crop: src.replace(/\/(normal|small|large)\//, "/art_crop/") };
  }
  return data;
}

// Lazy, cached card-image lookup by name. Each distinct card is fetched at most once
// per session (shared module-level cache), so hovering the same card repeatedly — or
// the same card across tabs — never refetches.
const _imageCache = new Map(); // name -> Promise<{found, image, thumb, art_crop, ...}>
export function getCardImage(name) {
  if (!_imageCache.has(name)) {
    _imageCache.set(
      name,
      api.cardImage(name)
        .then(_deriveArtCrop)
        .catch(() => ({ found: false, image: null, thumb: null })),
    );
  }
  return _imageCache.get(name);
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

// Reverse of assembleDecklist: split a saved decklist that may carry
// "Commander\n1 Name\nDeck\n<rest>" headers back into { commander, deckText }.
// Falls back to { commander: "", deckText: text } when no commander header is present.
const _CMD_BLOCK = /^\s*commander\s*\r?\n((?:\s*\d+\s+.+\r?\n)+)\s*deck\s*\r?\n([\s\S]*)$/i;
export function disassembleDecklist(text) {
  const raw = (text || "").trim();
  const m = raw.match(_CMD_BLOCK);
  if (m) {
    const cmds = m[1].trim().split(/\r?\n/)
      .map((l) => l.trim().replace(/^\d+\s+/, "").trim())
      .filter(Boolean);
    return { commander: cmds.join(" && "), deckText: m[2].trim() };
  }
  return { commander: "", deckText: raw };
}

// Formats offered in the UI (trimmed per request). Value is the backend format key.
export const FORMATS = [
  ["commander", "Commander"],
  ["paupercommander", "Pauper Commander"],
  ["standard", "Standard"],
  ["modern", "Modern"],
  ["legacy", "Legacy"],
];
