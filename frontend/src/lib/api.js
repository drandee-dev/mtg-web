// Thin client for the FastAPI analysis backend. Base URL is configurable so the same
// build works locally (localhost) and in production (your Render URL).

const BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

let _userEmail = "";
export function setUserEmail(email) { _userEmail = email || ""; }

function _headers() {
  const h = { "Content-Type": "application/json" };
  if (_userEmail) h["X-User-Email"] = _userEmail;
  return h;
}

async function get(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: _userEmail ? { "X-User-Email": _userEmail } : {} });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
      return res.json();
    } catch (e) {
      if (attempt === 0 && (e.message === "Failed to fetch" || e.name === "TypeError")) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw e;
    }
  }
}

async function post(path, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        method: "POST",
        headers: _headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
      return res.json();
    } catch (e) {
      if (attempt === 0 && (e.message === "Failed to fetch" || e.name === "TypeError")) {
        // Server might be waking from cold start — wait and retry once
        await new Promise((r) => setTimeout(r, 5000));
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

export const api = {
  health: () => get("/api/health"),
  rules: (params) => get("/api/rules/search", params),
  cards: (params) => get("/api/cards/search", params),
  analyze: (decklist, format) => post("/api/deck/analyze", { decklist, format }),
  exportText: (decklist, format) => post("/api/deck/export", { decklist, format }),
  recommend: (decklist, format) => post("/api/deck/recommend", { decklist, format }),
  combos: (decklist, format) => post("/api/deck/combos", { decklist, format }),
  composition: (decklist, format) => post("/api/deck/composition", { decklist, format }),
  commanders: (q) => get("/api/commanders/search", { q }),
  cardImage: (name) => get("/api/cards/image", { name }),
  wizardSkeleton: (commander, format, bracket) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return post("/api/deck/wizard/skeleton", { commander, format, ...(bracket != null ? { bracket } : {}), ...(key ? { api_key: key } : {}) });
  },
  wizardNarrate: (commander, category, card_names, decklist) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return post("/api/deck/wizard/narrate", { commander, category, card_names, decklist, ...(key ? { api_key: key } : {}) });
  },
  wizardChat: (commander, messages, decklist, format, bracket) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return post("/api/deck/wizard/chat", { commander, messages, decklist, format, ...(bracket != null ? { bracket } : {}), ...(key ? { api_key: key } : {}) });
  },
  rulesAsk: (question) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return post("/api/rules/ask", { question, ...(key ? { api_key: key } : {}) });
  },
  rulesAskStream: (question, onChunk) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return postStream("/api/rules/ask/stream", { question, ...(key ? { api_key: key } : {}) }, onChunk);
  },
  aiCuts: (decklist, format, bracket) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return post("/api/deck/ai/cuts", { decklist, format, ...(bracket != null ? { bracket } : {}), ...(key ? { api_key: key } : {}) });
  },
  aiFills: (decklist, format, bracket) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return post("/api/deck/ai/fills", { decklist, format, ...(bracket != null ? { bracket } : {}), ...(key ? { api_key: key } : {}) });
  },
  aiExplain: (decklist, format, card_names, bracket) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return post("/api/deck/ai/explain", { decklist, format, card_names, ...(bracket != null ? { bracket } : {}), ...(key ? { api_key: key } : {}) });
  },
  aiCombos: (decklist, format, combos, near_misses, bracket) => {
    const key = localStorage.getItem("mtgweb:anthropicKey") || "";
    return post("/api/deck/ai/combos", { decklist, format, combos, near_misses, ...(bracket != null ? { bracket } : {}), ...(key ? { api_key: key } : {}) });
  },
};

// Lazy, cached card-image lookup by name. Each distinct card is fetched at most once
// per session (shared module-level cache), so hovering the same card repeatedly — or
// the same card across tabs — never refetches.
const _imageCache = new Map(); // name -> Promise<{found, image, thumb}>
export function getCardImage(name) {
  if (!_imageCache.has(name)) {
    _imageCache.set(
      name,
      api.cardImage(name).catch(() => ({ found: false, image: null, thumb: null })),
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
  return `Commander\n1 ${commander}\nDeck\n${text}`;
}

// Formats offered in the UI (trimmed per request). Value is the backend format key.
export const FORMATS = [
  ["commander", "Commander"],
  ["paupercommander", "Pauper Commander"],
  ["standard", "Standard"],
  ["modern", "Modern"],
  ["legacy", "Legacy"],
];
