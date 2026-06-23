import { useState } from "react";
import { api } from "../../lib/api";

export default function DeckInput({ decklist, setDecklist, addCard, notify }) {
  const [showText, setShowText] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function doSearch() {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const r = await api.cards({ name: q, limit: 8 });
      setResults(r.results || []);
    } catch {
      notify?.("Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="deck-input">
      <div className="row" style={{ gap: ".4rem", marginBottom: ".4rem" }}>
        <div className="deck-input-search" style={{ display: "flex", gap: ".3rem", flex: 1 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Add cards… e.g. Sol Ring"
            aria-label="Search cards to add"
            style={{ flex: 1 }}
          />
          <button className="ghost small" onClick={doSearch} disabled={searching}>
            {searching ? "…" : "+ Add"}
          </button>
        </div>
        <button
          className="ghost small"
          onClick={() => setShowText(!showText)}
          aria-label={showText ? "Hide text editor" : "Show text editor"}
        >
          {showText ? "Hide text" : "Edit text"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="deck-input-results">
          {results.map((c) => (
            <button
              key={c.name}
              className="deck-input-result"
              onClick={() => { addCard(c.name); setResults([]); setSearch(""); }}
            >
              <strong>{c.name}</strong>
              <span className="muted small"> {c.type_line}</span>
              {c.prices?.usd && <span className="muted small"> · ${c.prices.usd}</span>}
            </button>
          ))}
        </div>
      )}

      {showText && (
        <textarea
          value={decklist}
          onChange={(e) => setDecklist(e.target.value)}
          placeholder={"1 Sol Ring\n1 Llanowar Elves\n..."}
          style={{ marginTop: ".3rem" }}
        />
      )}
    </div>
  );
}
