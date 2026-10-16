import { useEffect, useRef, useState } from "react";
import CardTypeahead from "./CardTypeahead";
import ViewToggle from "./ViewToggle";

// The Cards section's toolbar, on the deck's tab strip (UX overhaul job 3.3,
// decision 7). "Add a card" is always there. Filter and the Stacks/Grid/List
// switch sit on the strip when it has room and fold into the View button when
// it does not (a container query on .deck-strip decides, so nothing is
// measured here). Grouping, sorting and Stack as live in the View button.

const SORTS = [
  { id: "name", label: "Name" },
  { id: "cmc", label: "Mana value" },
  { id: "price", label: "Price" },
];

const GROUPS = [
  { id: "type", label: "Type" },
  { id: "role", label: "Role" },
  { id: "cmc", label: "Mana value" },
  { id: "color", label: "Color" },
  { id: "rarity", label: "Rarity" },
  { id: "price", label: "Price range" },
];

const MODE_LABEL = { stack: "Stacks", grid: "Grid", list: "List" };

function FilterField({ filter, setFilter }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className="ct-filter">
      <input
        className="cg-tb-filter-input"
        value={filter || ""}
        onChange={(e) => setFilter(e.target.value)}
        onFocus={() => setHelpOpen(false)}
        placeholder="Filter"
        aria-label="Filter cards in deck"
      />
      {filter && (
        <button className="cg-tb-filter-clear" onClick={() => setFilter("")} aria-label="Clear filter">✕</button>
      )}
      <button
        className="cg-tb-help"
        aria-label="Filter syntax help"
        aria-expanded={helpOpen}
        onClick={() => setHelpOpen((o) => !o)}
      >?</button>
      {helpOpen && (
        <div className="filter-help-pop" role="tooltip">
          <div className="fhp-title">Filter the deck</div>
          <table>
            <tbody>
              <tr><td><code>lightning</code></td><td>name contains</td></tr>
              <tr><td><code>t:creature</code></td><td>type line contains</td></tr>
              <tr><td><code>mv:3</code> · <code>mv:&gt;=4</code></td><td>mana value</td></tr>
              <tr><td><code>c:gw</code> · <code>c:c</code></td><td>color identity within</td></tr>
              <tr><td><code>usd:&gt;5</code></td><td>price above $5</td></tr>
              <tr><td><code>t:instant mv:&lt;2</code></td><td>terms combine (AND)</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// `viewControls` is false on an empty deck: there is nothing to filter or
// lay out, so only the add field shows.
export default function CardToolbar({ view, addCard, notify, filter, setFilter, viewControls = true }) {
  const { viewMode, setViewMode, stackMode, setStackMode, sortBy, setSortBy, groupBy, setGroupBy } = view;
  const [open, setOpen] = useState(false);
  const viewRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (viewRef.current && !viewRef.current.contains(e.target)) setOpen(false); }
    // Escape closes and hands focus back to the button, so it isn't lost
    // with the panel that held it.
    function onKey(e) {
      if (e.key !== "Escape") return;
      setOpen(false);
      viewRef.current?.querySelector(".ct-view-btn")?.focus();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groupLabel = (GROUPS.find((g) => g.id === groupBy)?.label || "Type").toLowerCase();

  return (
    <div className="card-toolbar">
      {addCard && (
        <div className="ct-add" id="deck-add-card">
          <CardTypeahead compact addCard={addCard} notify={notify} placeholder="Add a card by name" />
        </div>
      )}
      {viewControls && setFilter && <div className="ct-wide"><FilterField filter={filter} setFilter={setFilter} /></div>}
      {viewControls && <div className="ct-wide"><ViewToggle mode={viewMode} setMode={setViewMode} /></div>}
      {viewControls && <div className="ct-view" ref={viewRef}>
        <button
          className="ct-view-btn"
          aria-expanded={open}
          aria-controls="ct-view-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="ct-view-label">View</span>
          <span className="ct-view-summary">
            <span className="ct-narrow-inline">{MODE_LABEL[viewMode]}, </span>by {groupLabel}
          </span>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 6 8 10.5 12.5 6" /></svg>
        </button>
        {open && (
          <div className="ct-view-panel" id="ct-view-panel" role="group" aria-label="View options">
            {/* What the strip has no room for. */}
            <div className="ct-narrow">
              <ViewToggle mode={viewMode} setMode={setViewMode} />
              {setFilter && <FilterField filter={filter} setFilter={setFilter} />}
            </div>
            {viewMode === "stack" && (
              <div className="ct-row">
                <span className="ct-row-label">Stack as</span>
                <div className="ai-panel-toggle" role="group" aria-label="Stack display mode">
                  <button className={stackMode === "image" ? "active" : ""}
                    aria-pressed={stackMode === "image"} onClick={() => setStackMode("image")}>Image</button>
                  <button className={stackMode === "text" ? "active" : ""}
                    aria-pressed={stackMode === "text"} onClick={() => setStackMode("text")}>Text</button>
                </div>
              </div>
            )}
            <label className="ct-row">
              <span className="ct-row-label">Group by</span>
              <select className="sort-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} aria-label="Group cards by">
                {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </label>
            <label className="ct-row">
              <span className="ct-row-label">Sort by</span>
              <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort cards">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>}
    </div>
  );
}
