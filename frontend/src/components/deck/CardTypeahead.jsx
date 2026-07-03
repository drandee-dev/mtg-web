import { forwardRef, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

// Predictive card-add input: debounced name search against /api/cards/search
// with a picker dropdown (name · type · price), keyboard ↑↓/Enter, spinner
// while fetching. Used by the toolbar Quick add and the deck search panel.
const CardTypeahead = forwardRef(function CardTypeahead(
  { addCard, notify, placeholder = "Add a card…", compact = false, autoFocus = false },
  outerRef
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Debounced predictive lookup — 250ms after the last keystroke, 2+ chars.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setOpen(false); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const r = await api.cards({ name: q, limit: 8 });
        if (seq !== seqRef.current) return; // a newer query is in flight
        setResults(r.results || []);
        setOpen(true);
        setHi(0);
      } catch {
        if (seq === seqRef.current) { setResults([]); setOpen(false); }
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close on outside pointerdown
  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  function pick(cardName) {
    addCard(cardName);
    notify?.(`Added ${cardName}`);
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!open || results.length === 0) {
      // No suggestions yet — Enter still adds the raw name (old quick-add behavior).
      if (e.key === "Enter" && query.trim()) pick(query.trim());
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[hi]?.name || query.trim()); }
  }

  return (
    <div className={`card-typeahead${compact ? " compact" : ""}`} ref={(el) => {
      wrapRef.current = el;
      if (typeof outerRef === "function") outerRef(el);
      else if (outerRef) outerRef.current = el;
    }}>
      <div className="cta-input-wrap">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length) setOpen(true); }}
          placeholder={placeholder}
          aria-label="Search cards to add"
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
        />
        {searching && <span className="cta-spinner" aria-hidden="true" />}
      </div>
      {open && results.length > 0 && (
        <div className="deck-input-results" role="listbox">
          {results.map((c, i) => (
            <button
              key={c.name}
              role="option"
              aria-selected={i === hi}
              className={`deck-input-result${i === hi ? " hi" : ""}`}
              onPointerEnter={() => setHi(i)}
              onClick={() => pick(c.name)}
            >
              <span className="deck-input-result-name">{c.name}</span>
              <span className="muted small">{c.type_line}</span>
              {c.prices?.usd && <span className="muted small">${c.prices.usd}</span>}
              <span className="deck-input-result-add">+ Add</span>
            </button>
          ))}
        </div>
      )}
      {open && !searching && results.length === 0 && query.trim().length >= 2 && (
        <div className="deck-input-results"><div className="cta-empty">No cards match “{query.trim()}”</div></div>
      )}
    </div>
  );
});

export default CardTypeahead;
