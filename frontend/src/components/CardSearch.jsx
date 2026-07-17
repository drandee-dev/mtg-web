import { useState } from "react";
import { api } from "../lib/api";
import CardPreview from "./CardPreview";

// Tabs unmount on switch — this module-level snapshot keeps the last search
// (filters + results) alive for the session, so hopping to another tab and
// back doesn't blank the search. Deliberately not localStorage: a fresh page
// load starts clean.
const EMPTY_FILTERS = { name: "", type: "", oracle: "", color_identity: "", cmc_max: "" };
let _lastSearch = { f: EMPTY_FILTERS, res: null };

// Search Scryfall bulk data with deck-building filters.
export default function CardSearch({ addCard, notify }) {
  const [f, setF] = useState(_lastSearch.f);
  const [res, setRes] = useState(_lastSearch.res);
  const [busy, setBusy] = useState(false);

  function up(k, v) { setF((p) => { const next = { ...p, [k]: v }; _lastSearch = { ..._lastSearch, f: next }; return next; }); }

  async function run() {
    setBusy(true);
    try {
      const r = await api.cards({ ...f, limit: 25 });
      _lastSearch = { f, res: r };
      setRes(r);
    } catch (e) {
      notify(`Search failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>Card search</h2>
        {!res && <p className="muted small">Search every Magic card by name, type, text, or cost — tap + Add to drop one straight into your deck.</p>}
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) run(); }}>
          <div><label>Name</label><input value={f.name} onChange={(e) => up("name", e.target.value)} placeholder="bolt" /></div>
          <div><label>Type</label><input value={f.type} onChange={(e) => up("type", e.target.value)} placeholder="instant" /></div>
          <div><label>Oracle text (regex)</label><input value={f.oracle} onChange={(e) => up("oracle", e.target.value)} placeholder="draw a card" /></div>
          <div><label>Color identity</label><input value={f.color_identity} onChange={(e) => up("color_identity", e.target.value)} placeholder="WUG (C=colorless)" /></div>
          <div><label>Max CMC</label><input value={f.cmc_max} onChange={(e) => up("cmc_max", e.target.value)} placeholder="3" inputMode="numeric" /></div>
        </div>
        <div className="row" style={{ marginTop: ".6rem" }}>
          <button className="primary" onClick={run} disabled={busy}>{busy ? "Searching…" : "Search"}</button>
        </div>
      </div>

      {res && (
        <div className="panel">
          <p className="muted small">{res.count} result{res.count === 1 ? "" : "s"}</p>
          <div style={{ overflowX: "auto" }}>
            <table className="results-table">
              <thead><tr><th>Name</th><th>Type</th><th>CMC</th><th>$</th>{addCard && <th></th>}</tr></thead>
              <tbody>
                {res.results.map((c, i) => (
                  <tr key={c.name || i}>
                    <td><CardPreview name={c.name} /></td>
                    <td className="muted">{c.type_line}</td>
                    <td>{c.cmc}</td>
                    <td>{c.prices?.usd ? `$${c.prices.usd}` : "—"}</td>
                    {addCard && <td><button className="ghost small" onClick={() => { addCard(c.name); notify(`Added ${c.name}`); }}>+ Add</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
