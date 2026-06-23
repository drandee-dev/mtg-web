import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { parseDeckText } from "../../lib/deckParser";
import CardPreview from "../CardPreview";

// A persisted "considering" pile shown as a slide-in side panel. Cards can be
// moved into the deck, removed, added by search, or suggested by the bot.
export default function Maybeboard({ open, onClose, maybeboard, setMaybeboard, onMoveToDeck, onSuggest, suggesting, notify }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { cards } = parseDeckText(maybeboard);

  function add(name) {
    setMaybeboard((prev) => {
      const existing = parseDeckText(prev).cards.some((c) => c.name.toLowerCase() === name.toLowerCase());
      if (existing) return prev;
      return `${(prev || "").replace(/\s*$/, "")}\n1 ${name}`.trim();
    });
  }

  function remove(name) {
    setMaybeboard((prev) => {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return prev.split("\n").filter((l) => !new RegExp(`^\\s*\\d+\\s+${esc}\\s*$`, "i").test(l)).join("\n").trim();
    });
  }

  function moveToDeck(name) {
    onMoveToDeck(name);
    remove(name);
    notify?.(`Moved ${name} to deck`);
  }

  async function doSearch() {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const r = await api.cards({ name: q, limit: 8 });
      setResults(r.results || []);
    } catch { notify?.("Search failed."); }
    finally { setSearching(false); }
  }

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="maybeboard-panel" role="dialog" aria-modal="true" aria-label="Considering pile">
        <div className="maybeboard-header">
          <strong>Considering ({cards.length})</strong>
          <button className="ghost small" onClick={onClose} aria-label="Close considering pile">✕</button>
        </div>

        <div className="maybeboard-add">
          <div style={{ display: "flex", gap: ".3rem" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="Search a card to consider…"
              aria-label="Search a card to add to considering"
              style={{ flex: 1 }}
            />
            <button className="ghost small" onClick={doSearch} disabled={searching}>{searching ? "…" : "Find"}</button>
          </div>
          {results.length > 0 && (
            <div className="deck-input-results">
              {results.map((c) => (
                <button key={c.name} className="deck-input-result"
                  onClick={() => { add(c.name); setResults([]); setSearch(""); }}>
                  <strong>{c.name}</strong>
                  <span className="muted small"> {c.type_line}</span>
                </button>
              ))}
            </div>
          )}
          {onSuggest && (
            <button className="primary small" style={{ width: "100%", marginTop: ".4rem" }}
              onClick={onSuggest} disabled={suggesting}>
              {suggesting ? "Thinking…" : "✨ Suggest cards to consider"}
            </button>
          )}
        </div>

        <div className="maybeboard-list">
          {cards.length === 0 && (
            <p className="muted small" style={{ padding: ".5rem" }}>
              Nothing here yet. Search above, or let the Planeswalker suggest cards to weigh.
            </p>
          )}
          {cards.map((c) => (
            <div key={c.name} className="maybeboard-item">
              <CardPreview name={c.name} />
              <div className="maybeboard-item-actions">
                <button className="ghost small btn-good" onClick={() => moveToDeck(c.name)} title="Move to deck">→ Deck</button>
                <button className="ghost small" onClick={() => remove(c.name)} aria-label={`Remove ${c.name}`}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
