import { forwardRef, useState, useRef } from "react";
import { api } from "../../lib/api";

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

const FILTER_CHIPS = [
  { prefix: "t:", label: "Type", example: "t:creature" },
  { prefix: "c:", label: "Color", example: "c:wug" },
  { prefix: "cmc:", label: "MV", example: "cmc<4" },
  { prefix: "o:", label: "Oracle", example: 'o:"draw a card"' },
  { prefix: "$<", label: "Price", example: "$<5" },
];

function activeFilters(search) {
  if (!search.trim()) return [];
  const parsed = parseSearch(search);
  const active = [];
  if (parsed.type) active.push({ key: "type", label: `t:${parsed.type}` });
  if (parsed.color_identity) active.push({ key: "color", label: `c:${parsed.color_identity}` });
  if (parsed.cmc_min != null && parsed.cmc_max != null && parsed.cmc_min === parsed.cmc_max) {
    active.push({ key: "cmc", label: `cmc:${parsed.cmc_min}` });
  } else {
    if (parsed.cmc_min != null) active.push({ key: "cmc_min", label: `cmc>${parsed.cmc_min}` });
    if (parsed.cmc_max != null) active.push({ key: "cmc_max", label: `cmc<${parsed.cmc_max}` });
  }
  if (parsed.oracle) active.push({ key: "oracle", label: `o:${parsed.oracle}` });
  if (parsed.price_max != null) active.push({ key: "price_max", label: `$<${parsed.price_max}` });
  if (parsed.price_min != null) active.push({ key: "price_min", label: `$>${parsed.price_min}` });
  return active;
}

function removeFilter(search, filterKey) {
  const patterns = {
    type: /\b(?:t|type)[:<>=]+\S+/gi,
    color: /\b(?:c|color)[:<>=]+\S+/gi,
    cmc: /\b(?:cmc|mv)[:<>=]+\S+/gi,
    cmc_min: /\b(?:cmc|mv)[>]+\S+/gi,
    cmc_max: /\b(?:cmc|mv)[<]+\S+/gi,
    oracle: /\b(?:o|oracle)[:<>=]+"[^"]*"|\b(?:o|oracle)[:<>=]+\S+/gi,
    price_max: /\$<\S+/gi,
    price_min: /\$>\S+/gi,
  };
  const pat = patterns[filterKey];
  if (!pat) return search;
  return search.replace(pat, "").replace(/\s+/g, " ").trim();
}

const DeckInput = forwardRef(function DeckInput({ decklist, setDecklist, addCard, notify, filter, setFilter, locked }, ref) {
  const [showText, setShowText] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);

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

  function insertChip(prefix) {
    const hasPrefix = search.toLowerCase().includes(prefix.toLowerCase());
    if (hasPrefix) return;
    setSearch((s) => `${s.trim()} ${prefix}`.trim());
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function dismissFilter(key) {
    setSearch((s) => removeFilter(s, key));
  }

  const active = activeFilters(search);

  return (
    <div className="deck-input" ref={ref}>
      {!locked && (
        <>
          <div className="deck-input-bar">
            <input
              ref={inputRef}
              className="deck-input-field"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder='Search… e.g. "Sol Ring" or t:creature c:green cmc<4'
              aria-label="Search cards to add"
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

          {/* Filter chips row */}
          <div className="filter-chips-row">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.prefix}
                className={`filter-chip${search.toLowerCase().includes(chip.prefix.toLowerCase()) ? " active" : ""}`}
                onClick={() => insertChip(chip.prefix)}
                title={chip.example}
              >
                {chip.label}
              </button>
            ))}

            {/* Active filter indicators */}
            {active.map((f) => (
              <span key={f.key} className="filter-active-tag">
                {f.label}
                <button className="filter-active-x" onClick={() => dismissFilter(f.key)} aria-label={`Remove ${f.label}`}>✕</button>
              </span>
            ))}

            {active.length > 0 && (
              <button className="filter-chip clear" onClick={() => setSearch("")}>Clear all</button>
            )}
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
