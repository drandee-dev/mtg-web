// Deck-grid filter syntax — matches cards against metadata the grid already
// holds (metaMap from /api/cards/image). Terms are AND-ed; anything that isn't
// a recognized `key:value` token is a name-substring match.
//
//   lightning        name contains "lightning"
//   t:creature       type line contains
//   mv:3  mv:>=4     mana value (also mv>4 / cmc:<2 forms)
//   c:gw             color identity is within the given colors
//   usd:>5           price (also $>5 / price:<1)
//
// Documented for users by the Filter "?" popover in CardGrid.

const TOKEN_RE = /(?:[^\s"]+|"[^"]*")+/g;
const KEYED_RE = /^(t|type|c|color|mv|cmc|usd|price|\$)(?::?(>=|<=|>|<|=)|:)(.+)$/i;

export function parseDeckFilter(raw) {
  const terms = [];
  for (const tok of (raw || "").match(TOKEN_RE) || []) {
    const m = tok.match(KEYED_RE);
    if (!m) {
      const name = tok.replace(/^"|"$/g, "").toLowerCase();
      if (name) terms.push({ kind: "name", value: name });
      continue;
    }
    const key = m[1].toLowerCase();
    const op = m[2] || "=";
    const val = m[3].replace(/^"|"$/g, "");
    if (key === "t" || key === "type") {
      terms.push({ kind: "type", value: val.toLowerCase() });
    } else if (key === "c" || key === "color") {
      terms.push({ kind: "color", value: val.toUpperCase().replace(/[^WUBRGC]/g, "") });
    } else if (key === "mv" || key === "cmc") {
      const n = parseFloat(val);
      if (!isNaN(n)) terms.push({ kind: "mv", op, value: n });
    } else {
      const n = parseFloat(val);
      if (!isNaN(n)) terms.push({ kind: "price", op, value: n });
    }
  }
  return terms;
}

function cmpOp(actual, op, wanted) {
  if (op === ">") return actual > wanted;
  if (op === ">=") return actual >= wanted;
  if (op === "<") return actual < wanted;
  if (op === "<=") return actual <= wanted;
  return actual === wanted;
}

export function cardMatchesFilter(name, meta, terms) {
  for (const term of terms) {
    if (term.kind === "name") {
      if (!name.toLowerCase().includes(term.value)) return false;
    } else if (term.kind === "type") {
      if (!(meta?.type_line || "").toLowerCase().includes(term.value)) return false;
    } else if (term.kind === "color") {
      const identity = meta?.color_identity || [];
      // c:gw → identity must fit within {G,W}; c:c → colorless only
      if (term.value === "C") {
        if (identity.length > 0) return false;
      } else {
        const allowed = new Set(term.value.split(""));
        if (identity.length === 0 && term.value.length > 0) return false;
        if (!identity.every((c) => allowed.has(c))) return false;
      }
    } else if (term.kind === "mv") {
      if (!cmpOp(meta?.cmc ?? 0, term.op, term.value)) return false;
    } else if (term.kind === "price") {
      if (!cmpOp(meta?.price_usd ?? 0, term.op, term.value)) return false;
    }
  }
  return true;
}
