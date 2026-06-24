import { useEffect, useRef } from "react";
import Curve from "../Curve";
import CardPreview from "../CardPreview";
import LoadingIndicator from "../LoadingIndicator";
import DrawProbability from "./DrawProbability";

const WUBRG = ["W", "U", "B", "R", "G", "C"];
const COLOR_NAME = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };

const REC_CATEGORIES = [
  ["high_synergy", "High synergy"],
  ["top_cards", "Top cards"],
  ["creatures", "Creatures"],
  ["instants", "Instants"],
  ["sorceries", "Sorceries"],
  ["artifacts", "Artifacts"],
  ["enchantments", "Enchantments"],
  ["planeswalkers", "Planeswalkers"],
  ["lands", "Lands"],
];

function statusBadge(status) {
  const s = (status || "").toUpperCase();
  if (s === "PASS" || s === "OK") return "good";
  if (s === "WARN") return "warn";
  return "bad";
}

export default function DeckSidebar({
  result, isAnalyzing,
  activePanel, onPanelClick, busy,
  recs, recCat, setRecCat, skipped, onSkip, onAddCard,
  combos, comp, budgetSwaps, onSwapCard,
  commander, format,
}) {
  const s = result?.stats || {};
  const mana = result?.mana || {};
  const legality = result?.legality || {};
  const bracket = result?.bracket || {};
  const bd = result?.breakdown || {};
  const price = bd.price_usd;

  const recList = recs?.categories?.[recCat] || [];

  const isCmdr = format === "commander" || format === "paupercommander";
  const cardCount = result?.total_cards;
  const cmdrCount = isCmdr && commander ? commander.split(" && ").filter(Boolean).length : 0;
  const deckTotal = (cardCount || 0) + cmdrCount;
  const cardCountStatus = isCmdr
    ? (deckTotal > 100 ? "bad" : deckTotal === 100 ? "good" : "warn")
    : ((cardCount || 0) >= 60 ? "good" : "warn");

  return (
    <aside className="deck-sidebar" role="complementary" aria-label="Deck statistics">
      {/* Stats overview — always visible */}
      <div className="sidebar-section">
        <div className="stat-grid">
          <Stat k="Cards" v={cardCount} className={cardCountStatus === "bad" ? "stat-danger" : ""} />
          <Stat k="Lands" v={s.land_count} />
          <Stat k="Avg CMC" v={s.avg_cmc} />
          <Stat k="Price" v={price != null ? `$${price.toFixed(2)}` : "—"}
            title={bd.prices_as_of ? `Prices as of ${bd.prices_as_of}` : null} />
        </div>
      </div>

      {/* Badges */}
      {result && (
        <div className="sidebar-section">
          <div className="row" style={{ gap: ".3rem", flexWrap: "wrap" }}>
            {result.format === "commander" && bracket.bracket != null && (
              <span className="badge">Bracket {bracket.bracket}</span>
            )}
            <span className={`badge ${statusBadge(legality.overall_status || (legality.violations?.length ? "FAIL" : "PASS"))}`}>
              Legality: {legality.overall_status || (legality.violations?.length ? "issues" : "ok")}
            </span>
            <span className={`badge ${statusBadge(mana.overall_status)}`}>
              Mana: {mana.overall_status || "—"}
            </span>
          </div>
        </div>
      )}

      {/* Mana curve */}
      {s.curve && (
        <details className="sidebar-section" open>
          <summary className="sidebar-section-header"><h3>Mana Curve</h3></summary>
          <div className="sidebar-section-body">
            <Curve curve={s.curve} />
          </div>
        </details>
      )}

      {/* WUBRG Colors */}
      <Colors mana={mana} />

      {/* Mana base health */}
      <ManaBase mana={mana} />

      {/* Legality issues */}
      {legality.violations?.length > 0 && (
        <details className="sidebar-section">
          <summary className="sidebar-section-header"><h3>Legality Issues</h3></summary>
          <div className="sidebar-section-body">
            <ul className="small">
              {legality.violations.map((v, i) => (
                <li key={i}>{v.message || v.detail || JSON.stringify(v)}</li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {/* Game changers */}
      {bracket.game_changers?.length > 0 && (
        <details className="sidebar-section">
          <summary className="sidebar-section-header"><h3>Game Changers</h3></summary>
          <div className="sidebar-section-body">
            <p className="small">
              {bracket.game_changers.map((n, i) => (
                <span key={n}>{i > 0 && ", "}<CardPreview name={n} /></span>
              ))}
            </p>
          </div>
        </details>
      )}

      {/* Action accordion — each panel's content renders inline */}
      <div className="sidebar-section sidebar-accordion">

        {/* Recommendations */}
        <AccordionItem
          id="Recommendations" label="Recommendations"
          activePanel={activePanel} busy={busy} onPanelClick={onPanelClick}
        >
          {recs?.categories && Object.keys(recs.categories).length > 0 && (
            <div className="acc-panel-body">
              <select value={recCat} onChange={(e) => setRecCat(e.target.value)} style={{ width: "100%", marginBottom: ".3rem" }}>
                {REC_CATEGORIES.filter(([k]) => recs.categories[k]?.length).map(([k, label]) => (
                  <option key={k} value={k}>{label} ({recs.categories[k].length})</option>
                ))}
              </select>
              {recList.filter((c) => !skipped.has(c.name)).map((c) => (
                <div key={c.name} className="acc-rec-row" style={{ opacity: c.in_deck ? 0.45 : 1 }}>
                  <div className="acc-rec-info">
                    <CardPreview name={c.name} />
                    <span className="muted small" style={{ marginLeft: ".3rem" }}>
                      {c.synergy != null ? `${(c.synergy * 100).toFixed(0)}%` : ""}
                    </span>
                  </div>
                  {!c.in_deck && (
                    <div className="row" style={{ gap: ".15rem", flex: "none" }}>
                      <button className="ghost small" style={{ padding: ".1rem .3rem", minHeight: "auto", fontSize: ".7rem" }} onClick={() => onSkip(c.name)}>Skip</button>
                      <button className="ghost small" style={{ padding: ".1rem .3rem", minHeight: "auto", fontSize: ".7rem" }} onClick={() => onAddCard(c.name)}>+ Add</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </AccordionItem>

        {/* Find Combos */}
        <AccordionItem
          id="Combos" label="Find Combos"
          activePanel={activePanel} busy={busy} onPanelClick={onPanelClick}
        >
          {combos && (
            <div className="acc-panel-body">
              {combos.combos?.length === 0 && combos.near_misses?.length === 0 && (
                <p className="muted small">No combos or near-misses found.</p>
              )}
              {combos.combos?.map((c, i) => (
                <div key={i} className="acc-combo-row">
                  <span className="badge good small">combo</span>
                  <span className="small"> {c.cards?.join(" + ")}</span>
                </div>
              ))}
              {combos.near_misses?.map((c, i) => (
                <div key={i} className="acc-combo-row">
                  <span className="badge warn small">1 away</span>
                  <span className="small"> {c.missing_card || c.missing_template}</span>
                  {c.missing_card && (
                    <button className="ghost small" style={{ padding: ".1rem .3rem", minHeight: "auto", fontSize: ".7rem", marginLeft: "auto" }}
                      onClick={() => onAddCard(c.missing_card)}>+ Add</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </AccordionItem>

        {/* Composition */}
        <AccordionItem
          id="Composition" label="Composition"
          activePanel={activePanel} busy={busy} onPanelClick={onPanelClick}
        >
          {comp && (
            <div className="acc-panel-body">
              {comp.is_commander && <p className="muted small" style={{ margin: "0 0 .3rem" }}>Commander rules-of-thumb targets.</p>}
              <div className="acc-comp-grid">
                {comp.categories.map((c) => (
                  <div className="acc-comp-row" key={c.key}>
                    <span className="small">{c.label}</span>
                    <span className="small">
                      <strong>{c.count}</strong>
                      {c.target ? <span className="muted"> / {c.target}</span> : null}
                      {c.status === "thin" && <span className="badge bad small" style={{ marginLeft: ".2rem" }}>thin</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AccordionItem>

        {/* Budget Swaps */}
        <AccordionItem
          id="Budget" label="Budget Swaps"
          activePanel={activePanel} busy={busy} onPanelClick={onPanelClick}
        >
          {budgetSwaps?.swaps && (
            <div className="acc-panel-body">
              {budgetSwaps.swaps.length === 0 ? (
                <p className="muted small">Already budget-friendly!</p>
              ) : (
                <>
                  <p className="muted small" style={{ margin: "0 0 .3rem" }}>Save ~${budgetSwaps.total_savings?.toFixed(2)}</p>
                  {budgetSwaps.swaps.map((sw) => (
                    <div key={sw.card} className="acc-swap-row">
                      <div className="small">
                        <CardPreview name={sw.card} /> <span className="muted">${sw.price}</span>
                        <span className="muted"> → </span>
                        <CardPreview name={sw.alternative.name} /> <span className="muted">${sw.alternative.price}</span>
                      </div>
                      <button className="ghost small btn-good" style={{ padding: ".1rem .3rem", minHeight: "auto", fontSize: ".7rem" }}
                        onClick={() => onSwapCard(sw.card, sw.alternative.name)}>Swap</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </AccordionItem>

        {/* Draw Odds */}
        <AccordionItem
          id="DrawOdds" label="Draw Odds"
          activePanel={activePanel} busy={busy} onPanelClick={onPanelClick}
        >
          <div className="acc-panel-body">
            <DrawProbability result={result} commander={commander} format={format} compact />
          </div>
        </AccordionItem>

      </div>

      <LoadingIndicator label="Analyzing deck" active={isAnalyzing} />
    </aside>
  );
}

function AccordionItem({ id, label, activePanel, busy, onPanelClick, children }) {
  const isActive = activePanel === id;
  const isLoading = busy === id;
  const itemRef = useRef(null);

  useEffect(() => {
    if (isActive && !isLoading && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isActive, isLoading]);

  return (
    <div className="acc-item" ref={itemRef}>
      <button
        className={`accordion-row${isActive ? " active" : ""}`}
        onClick={() => onPanelClick(id)}
        disabled={isLoading}
      >
        <span>{isLoading ? "Loading…" : label}</span>
        <span className={`accordion-chevron${isActive ? " open" : ""}`}>▾</span>
      </button>
      {isActive && (
        <div className="acc-panel">
          {isLoading && <LoadingIndicator label={`Loading ${label.toLowerCase()}`} active />}
          {!isLoading && children}
        </div>
      )}
    </div>
  );
}

function Colors({ mana }) {
  const pct = mana.pip_demand_pct || {};
  const colors = WUBRG.filter((c) => pct[c]);
  if (!colors.length) return null;
  return (
    <details className="sidebar-section" open>
      <summary className="sidebar-section-header"><h3>Colors</h3></summary>
      <div className="sidebar-section-body">
        <div className="barlist">
          {colors.map((c) => (
            <div className="barrow" key={c}>
              <span className="blabel"><span className={`pip pip-${c}`}>{c}</span>{COLOR_NAME[c]}</span>
              <span className="btrack"><span className={`bfill f${c}`} style={{ width: `${pct[c]}%` }} /></span>
              <span className="bval">{pct[c]}%</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function ManaBase({ mana }) {
  const v = mana.viability;
  if (!v) return null;
  return (
    <details className="sidebar-section">
      <summary className="sidebar-section-header"><h3>Mana Base</h3></summary>
      <div className="sidebar-section-body">
        <div className="manabase">
          <div className="mbrow">
            <span>Sources <span className="muted">(lands+ramp)</span></span>
            <span>
              <strong>{v.mana_sources}</strong>
              <span className="muted"> / {v.recommended_sources}</span>{" "}
              <span className={`badge ${statusBadge(v.sources_status)}`}>{v.sources_status}</span>
            </span>
          </div>
          <div className="formula">
            {v.land_count} lands + {v.ramp_count} ramp · avg MV {v.avg_mv}
          </div>
          <div className="mbrow">
            <span>Lands <span className="muted">(min)</span></span>
            <span>
              <strong>{v.land_count}</strong>
              <span className="muted"> / {v.land_floor}</span>{" "}
              <span className={`badge ${statusBadge(v.land_status)}`}>{v.land_status}</span>
            </span>
          </div>
          <div className="mbrow">
            <span>Color fixing</span>
            <span className={`badge ${statusBadge(mana.color_balance_status)}`}>
              {mana.color_balance_status || "—"}
            </span>
          </div>
          {mana.color_balance_flags?.length > 0 && (
            <ul className="flaglist">
              {mana.color_balance_flags.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}

function Stat({ k, v, title, className }) {
  return (
    <div className={`stat${className ? ` ${className}` : ""}`} title={title || undefined}>
      <div className="k">{k}</div>
      <div className="v">{v ?? "—"}</div>
    </div>
  );
}
