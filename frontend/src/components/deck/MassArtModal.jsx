import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

/** Mass art change: pick target set(s) and/or a rarity, preview which deck
 * cards have a printing there, then pin them all in one apply. Set order is
 * priority order when a card exists in several. Nothing touches the deck
 * until Apply — Preview is read-only.
 */
export default function MassArtModal({ open, onClose, names, onApply, onClearPins, pinnedCount }) {
  if (!open) return null;
  return (
    <ModalInner
      names={names}
      onClose={onClose}
      onApply={onApply}
      onClearPins={onClearPins}
      pinnedCount={pinnedCount}
    />
  );
}

const RARITIES = [
  ["", "Any rarity"],
  ["common", "Common"],
  ["uncommon", "Uncommon"],
  ["rare", "Rare"],
  ["mythic", "Mythic"],
];

function ModalInner({ names, onClose, onApply, onClearPins, pinnedCount }) {
  const [query, setQuery] = useState("");
  const [setResults, setSetResults] = useState([]);
  const [chosen, setChosen] = useState([]); // [{code, name, released}] — order = priority
  const [rarity, setRarity] = useState("");
  const [preview, setPreview] = useState(null); // null | {matches, unmatched}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const debounce = useRef();
  const focusRef = useRef(null);

  useEffect(() => { focusRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Debounced set-directory search (short queries clear the list on the same
  // timer path — no sync setState inside the effect body)
  useEffect(() => {
    clearTimeout(debounce.current);
    const q = query.trim();
    debounce.current = setTimeout(async () => {
      if (q.length < 2) { setSetResults([]); return; }
      try {
        const r = await api.setSearch(q);
        setSetResults((r.sets || []).filter((s) => !chosen.some((c) => c.code === s.code)));
      } catch {
        setSetResults([]);
      }
    }, q.length < 2 ? 0 : 250);
    return () => clearTimeout(debounce.current);
  }, [query, chosen]);

  function addSet(s) {
    setChosen((prev) => [...prev, s]);
    setQuery("");
    setSetResults([]);
    setPreview(null);
    focusRef.current?.focus();
  }

  function removeSet(code) {
    setChosen((prev) => prev.filter((s) => s.code !== code));
    setPreview(null);
  }

  async function runPreview() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.massPrinting(names, chosen.map((s) => s.code), rarity || null);
      setPreview(r);
    } catch {
      setError("Couldn't match printings — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const canPreview = names.length > 0 && (chosen.length > 0 || rarity);
  const matches = preview?.matches || [];
  const unmatched = preview?.unmatched || [];

  return (
    <div className="icm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="icm-panel mam-panel" role="dialog" aria-modal="true" aria-label="Mass change art">
        <div className="icm-head">
          <h3>Mass change art</h3>
          <button className="icm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="icm-body">
          <label htmlFor="mam-set-input">Sets <span className="muted small">(first match wins — order is priority)</span></label>
          {chosen.length > 0 && (
            <div className="mam-chips">
              {chosen.map((s, i) => (
                <span key={s.code} className="mam-chip">
                  {chosen.length > 1 && <span className="mam-chip-rank">{i + 1}</span>}
                  {s.name} <span className="mam-chip-code">{s.code}</span>
                  <button className="mam-chip-x" onClick={() => removeSet(s.code)} aria-label={`Remove ${s.name}`}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="mam-search">
            <input
              id="mam-set-input"
              ref={focusRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Try "Final Fantasy", "Edge of Eternities", "Secret Lair"…'
              autoComplete="off"
            />
            {setResults.length > 0 && (
              <div className="autocomplete mam-ac" role="listbox" aria-label="Set suggestions">
                {setResults.map((s) => (
                  <button key={s.code} className="ac-item" role="option" onClick={() => addSet(s)}>
                    <strong>{s.name}</strong>
                    <span className="muted small"> {s.code} · {(s.released || "").slice(0, 4)} · {s.card_count} cards</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label htmlFor="mam-rarity">Rarity</label>
          <select
            id="mam-rarity"
            className="mam-rarity"
            value={rarity}
            onChange={(e) => { setRarity(e.target.value); setPreview(null); }}
          >
            {RARITIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>

          {!preview && (
            <div className="icm-hint">
              Matches each of your {names.length} cards to a printing in the chosen sets
              {rarity ? ` at ${rarity} rarity` : ""}. Cards without one keep their current art.
            </div>
          )}
          {error && <p className="opt-error">{error}</p>}

          {preview && (
            <div className="mam-preview">
              <div className="mam-preview-head">
                <strong>{matches.length}</strong> of {names.length} cards matched
                {unmatched.length > 0 && <span className="muted small"> · {unmatched.length} keep current art</span>}
              </div>
              {matches.length > 0 && (
                <div className="mam-matches">
                  {matches.map((m) => (
                    <div key={m.name} className="mam-match" title={`${m.name} — ${m.set_name} #${m.cn}`}>
                      {m.thumb ? <img src={m.thumb} alt={m.name} loading="lazy" /> : <div className="mam-thumb-ph" />}
                      <span className="mam-match-set">{m.set}</span>
                    </div>
                  ))}
                </div>
              )}
              {unmatched.length > 0 && (
                <details className="mam-unmatched">
                  <summary className="muted small">Not in these sets ({unmatched.length})</summary>
                  <p className="muted small">{unmatched.join(", ")}</p>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="icm-foot mam-foot">
          {pinnedCount > 0 && (
            <button className="ghost small mam-clear" onClick={() => { onClearPins(); onClose(); }}>
              Reset all art ({pinnedCount})
            </button>
          )}
          <button className="ghost small" onClick={onClose}>Cancel</button>
          {preview ? (
            <button
              className="primary small"
              disabled={matches.length === 0}
              onClick={() => { onApply(matches); onClose(); }}
            >
              Apply to {matches.length} card{matches.length === 1 ? "" : "s"}
            </button>
          ) : (
            <button className="primary small" disabled={!canPreview || busy} onClick={runPreview}>
              {busy ? "Matching…" : "Preview"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
