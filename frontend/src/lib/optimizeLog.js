// Session log for the Optimize queue. Every applied change is recorded per
// deck in localStorage so it survives reloads; each entry carries enough to
// invert the edit (Undo re-adds the cut / removes the add). Capped so the
// key can't grow unbounded. Keyed like goals: `mtgweb:optlog:{deckId||"current"}`.

const MAX_ENTRIES = 60;

const key = (deckId) => `mtgweb:optlog:${deckId || "current"}`;

export function loadLog(deckId) {
  try {
    const raw = localStorage.getItem(key(deckId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(deckId, log) {
  try {
    if (log.length) localStorage.setItem(key(deckId), JSON.stringify(log.slice(-MAX_ENTRIES)));
    else localStorage.removeItem(key(deckId));
  } catch {
    /* storage full or blocked — the log is best-effort */
  }
  // Same-tab broadcast: the chat's pinned log and the sidebar queue both
  // subscribe, so a change applied in one surface shows up in the other.
  window.dispatchEvent(new CustomEvent("mtgweb:optlog"));
}

// Skip entries (action: "skip") are AI session memory — proposals the user
// declined, sent back to /api/deck/optimize and chat so they aren't
// re-proposed. They aren't deck edits, so session-log UIs filter them out.
export const isVisibleEntry = (e) => e.action !== "skip";

// Shared entry factory so queue and chat write identical shapes.
export function makeEntry({ action, cut = null, add = null, source }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(), action, cut, add,
    ...(source ? { source } : {}),
  };
}

export function appendLog(deckId, entry) {
  const log = [...loadLog(deckId), entry].slice(-MAX_ENTRIES);
  save(deckId, log);
  return log;
}

export function removeLogEntry(deckId, id) {
  const log = loadLog(deckId).filter((e) => e.id !== id);
  save(deckId, log);
  return log;
}

export function clearLog(deckId) {
  save(deckId, []);
  return [];
}

// One-line human description of an entry, shared by the log UI and toasts.
export function describeEntry(e) {
  if (e.cut && e.add) return `${e.cut} → ${e.add}`;
  if (e.cut) return `Cut ${e.cut}`;
  return `Added ${e.add}`;
}
