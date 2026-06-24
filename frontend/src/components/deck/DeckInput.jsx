import { forwardRef, useState } from "react";
import { api } from "../../lib/api";

// Parse Archidekt-style search syntax into API params.
// Supported: t:creature, c:wug, cmc:3, cmc>2, cmc<5, o:draw, $<5, $>1
// Anything not matching a prefix is treated as a name search.
function parseSearch(raw) {
  const params = {};
  const nameParts = [];
  const tokens = raw.match(/(?:[^\s"]+|"[^"]*")/g) || [];
  for (const tok of tokens) {
    const m = tok.match(/^(t|type|c|color|cmc|mv|o|oracle|\$|price)([:<>=]+)(.+)$/i);
    if (!m) { nameParts.push(tok.replace(/^"|"$/g, "")); continue; }
    const key = m[1].toLowerCase();
    const op = m[2];
    const val = m[3].replace(/^"|"$/g, "");
    if (key === "t" || key === "type") {
      params.type = val;
    } else if (key === "c" || key === "color") {
      params.color_identity = val.toUpperCase();
    } else if (key === "cmc" || key === "mv") {
      const n = parseFloat(val);
      if (isNaN(n)) continue;
      if (op.includes(">") || op === ":>") params.cmc_min = n;
      else if (op.includes("<") || op === ":<") params.cmc_max = n;
      else { params.cmc_min = n; params.cmc_max = n; }
    } else if (key === "o" || key === "oracle") {
      params.oracle = val;
    } else if (key === "$" || key === "price") {
      const n = parseFloat(val);
      if (isNaN(n)) continue;
      if (op.includes("<")) params.price_max = n;
      else if (op.includes(">")) params.price_min = n;
    }
  }
  if (nameParts.length) params.name = nameParts.join(" ");
  return params;
}

const DeckInput = forwardRef(function DeckInput({ decklist, setDecklist, addCard, notify, filter, setFilter, locked }, ref) {
  const [showText, setShowText] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function doSearch() {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const params = { ...parseSearch(q), limit: 12 };
      const r = await api.cards(params);
      setResults(r.results || []);
      if (!r.results?.length) notify?.("No cards found.");
    } catch {
      notify?.("Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="deck-input" ref={ref}>
      {!locked && (
        <>
          <div className="deck-input-bar">
            <input
              className="deck-input-field"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder='Search… e.g. "Sol Ring" or t:creature c:green cmc<4'
              aria-label="Search cards to add (supports t: c: cmc: o: syntax)"
            />
            <button className="ghost small" onClick={doSearch} disabled={searching}>
              {searching ? "…" : "Search"}
            </button>
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
                  onClick={() => { addCard(c.name); setResults((prev) => prev.filter((r) => r.name !== c.name)); }}
                >
                  <span className="deck-input-result-name">{c.name}</span>
                  <span className="muted small">{c.type_line}</span>
                  {c.prices?.usd && <span className="muted small">${c.prices.usd}</span>}
                  <span className="deck-input-result-add">+ Add</span>
                </button>
              ))}
            </div>
          )}

          <div className="deck-input-row2">
            <div className="deck-input-syntax-hint muted small">
              Filters: <code>t:</code>type <code>c:</code>color <code>cmc:</code>mana value <code>o:</code>oracle text <code>$&lt;</code>price
            </div>
          </div>
        </>
      )}

      <div className={locked ? "deck-input-row2" : ""}>
        <div className="deck-filter-bar">
          <input
            className="deck-filter-field"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter deck…"
            aria-label="Filter cards in deck by name"
          />
          {filter && (
            <button className="ghost small" onClick={() => setFilter("")} aria-label="Clear filter"
              style={{ padding: ".15rem .35rem", minHeight: "auto", fontSize: ".7rem" }}>✕</button>
          )}
        </div>
      </div>

      {!locked && showText && (
        <textarea
          value={decklist}
          onChange={(e) => setDecklist(e.target.value)}
          placeholder={"1 Sol Ring\n1 Llanowar Elves\n..."}
          style={{ marginTop: ".3rem" }}
        />
      )}
    </div>
  );
});

export default DeckInput;
