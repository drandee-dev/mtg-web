import { useEffect, useRef, useState } from "react";
import Curve from "../Curve";
import CardPreview from "../CardPreview";
import LoadingIndicator from "../LoadingIndicator";
import DrawProbability from "./DrawProbability";
import AIFeedPanel from "./AIFeedPanel";
import { sanitizeHtml } from "../../lib/sanitize";

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
  cuts, onRemoveCard,
  upgrades, upgradeMode, setUpgradeMode,
  commander, format,
  strategy, strategyLoading,
  serverWarmed,
}) {
  const [panelMode, setPanelMode] = useState(
    () => localStorage.getItem("mtgweb:panelMode") || "accordion"
  );

  useEffect(() => {
    localStorage.setItem("mtgweb:panelMode", panelMode);
  }, [panelMode]);

  const s = result?.stats || {};
  const mana = result?.mana || {};
  const legality = result?.legality || {};
  const bracket = result?.bracket || {};
  const bd = result?.breakdown || {};
  const price = bd.price_usd;
  const weaknesses = comp?.categories?.filter((c) => c.status === "thin") || [];

  const recList = recs?.categories?.[recCat] || [];

  const isCmdr = format === "commander" || format === "paupercommander";
  const cardCount = result?.total_cards;
  const cardCountStatus = isCmdr
    ? ((cardCount || 0) > 100 ? "bad" : (cardCount || 0) === 100 ? "good" : "warn")
    : ((cardCount || 0) >= 60 ? "good" : "warn");

  return (
    <aside className="deck-sidebar" role="complementary" aria-label="Deck statistics">
      {/* Stats overview — always visible */}
      <div className="sidebar-section">
        <div className="stat-grid">
          <Stat k="Cards" v={cardCount != null ? (isCmdr ? `${cardCount}/100` : `${cardCount}/60+`) : "—"} className={cardCountStatus === "bad" ? "stat-danger" : ""} />
          <Stat k="Avg CMC" v={s.avg_cmc} />
          <Stat k="Price" v={price != null ? `$${price.toFixed(2)}` : "—"}
            title={bd.prices_as_of ? `Prices as of ${bd.prices_as_of}` : null} />
          <Stat k="Bracket" v={bracket.bracket ?? "—"} />
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

      {!serverWarmed && (
        <div className="sidebar-warming-pill">⚡ Still warming up — first analysis may take a moment</div>
      )}

      {/* Panel mode toggle */}
      <div className="sidebar-section" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".45rem .5rem" }}>
        <span style={{ fontSize: ".6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--muted)" }}>AI Panel</span>
        <div className="ai-panel-toggle">
          <button className={panelMode === "accordion" ? "active" : ""} onClick={() => setPanelMode("accordion")}>Accordion</button>
          <button className={panelMode === "feed" ? "active" : ""} onClick={() => setPanelMode("feed")}>Feed</button>
        </div>
      </div>

      {/* Strategy Overview */}
      {strategy && (
        <div className="sidebar-section" style={{ padding: ".5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".4rem" }}>
            <span style={{ fontSize: ".85rem" }}>⚡</span>
            <span style={{ fontSize: ".7rem", fontWeight: 600 }}>Strategy Overview</span>
            <span style={{ fontSize: ".55rem", background: "rgba(61,206,138,.15)", color: "var(--good)", borderRadius: "3px", padding: "1px 5px", fontWeight: 600 }}>auto</span>
          </div>
          <p style={{ fontSize: ".7rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(strategy.strategy) }} />
        </div>
      )}
      {strategyLoading && (
        <div className="sidebar-section" style={{ padding: ".5rem" }}>
          <LoadingIndicator label="Loading strategy" active />
        </div>
      )}

      {/* Weakness Check */}
      {weaknesses.length > 0 && (
        <div className="sidebar-section" style={{ padding: ".5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".4rem" }}>
            <span style={{ fontSize: ".85rem" }}>⚠️</span>
            <span style={{ fontSize: ".7rem", fontWeight: 600 }}>Weakness Check</span>
            <span style={{ fontSize: ".55rem", background: "rgba(229,184,76,.15)", color: "var(--warn)", borderRadius: "3px", padding: "1px 5px", fontWeight: 600 }}>{weaknesses.length} flag{weaknesses.length !== 1 ? "s" : ""}</span>
          </div>
          {weaknesses.map((w) => (
            <div key={w.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: ".3rem 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
              <div>
                <div style={{ fontSize: ".7rem", fontWeight: 600, color: "var(--warn)" }}>{w.label}</div>
                <div style={{ fontSize: ".6rem", color: "var(--muted)", marginTop: "1px" }}>{w.count} · target {w.target}</div>
              </div>
              <button style={{ fontSize: ".6rem", color: "var(--accent-2)", background: "none", border: "none", cursor: "pointer", padding: 0, minHeight: "auto" }}
                onClick={() => onPanelClick("Recommendations")}>Fix →</button>
            </div>
          ))}
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

      {/* AI sections — accordion or feed mode */}
      {panelMode === "feed" ? (
        <AIFeedPanel
          strategy={strategy}
          strategyLoading={strategyLoading}
          weaknesses={weaknesses}
          recs={recs}
          recCat={recCat}
          setRecCat={setRecCat}
          skipped={skipped}
          onSkip={onSkip}
          onAddCard={onAddCard}
          cuts={cuts}
          onRemoveCard={onRemoveCard}
          combos={combos}
          budgetSwaps={budgetSwaps}
          upgrades={upgrades}
          upgradeMode={upgradeMode}
          setUpgradeMode={setUpgradeMode}
          onSwapCard={onSwapCard}
          result={result}
          commander={commander}
          format={format}
          onPanelClick={onPanelClick}
          busy={busy}
        />
      ) : (
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

          {/* Cut Suggestions */}
          <AccordionItem
            id="Cuts" label="✂️ Cut Suggestions"
            activePanel={activePanel} busy={busy} onPanelClick={onPanelClick}
          >
            {cuts && (
              <div className="acc-panel-body">
                {cuts.cuts?.length === 0 && <p className="muted small">No cuts suggested.</p>}
                {cuts.cuts?.map((c) => (
                  <div key={c.name} className="acc-swap-row">
                    <div className="small">
                      <CardPreview name={c.name} />
                      <span className="muted" style={{ marginLeft: ".3rem" }}>{c.reason}</span>
                    </div>
                    <button className="ghost small btn-bad" style={{ padding: ".1rem .3rem", minHeight: "auto", fontSize: ".7rem" }}
                      onClick={() => onRemoveCard(c.name)}>Remove</button>
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

          {/* Upgrade Path */}
          <AccordionItem
            id="Upgrades" label="🚀 Upgrade Path"
            activePanel={activePanel} busy={busy} onPanelClick={onPanelClick}
          >
            <div className="acc-panel-body">
              <div className="ai-panel-toggle" style={{ marginBottom: ".4rem" }}>
                <button className={upgradeMode === "budget" ? "active" : ""} onClick={() => setUpgradeMode("budget")}>Budget</button>
                <button className={upgradeMode === "power" ? "active" : ""} onClick={() => setUpgradeMode("power")}>Power</button>
              </div>
              {upgradeMode === "budget" && budgetSwaps?.swaps && (
                <>
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
                </>
              )}
              {upgradeMode === "power" && upgrades?.upgrades?.map((u) => (
                <div key={u.replaces} className="acc-swap-row">
                  <div className="small">
                    <CardPreview name={u.replaces} />
                    <span className="muted"> → </span>
                    <CardPreview name={u.replacement} />
                    {u.price_usd != null && <span className="muted"> ${u.price_usd.toFixed(2)}</span>}
                  </div>
                  <button className="ghost small btn-good" style={{ padding: ".1rem .3rem", minHeight: "auto", fontSize: ".7rem" }}
                    onClick={() => onSwapCard(u.replaces, u.replacement)}>Swap</button>
                </div>
              ))}
            </div>
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
      )}

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
