import CardPreview from "../CardPreview";
import LoadingIndicator from "../LoadingIndicator";
import DrawProbability from "./DrawProbability";
import { sanitizeHtml } from "../../lib/sanitize";

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

export default function AIFeedPanel({
  strategy, strategyLoading, weaknesses,
  recs, recCat, setRecCat, skipped, onSkip, onAddCard,
  cuts, onRemoveCard,
  combos,
  budgetSwaps, upgrades, upgradeMode, setUpgradeMode, onSwapCard,
  result, commander, format,
  onPanelClick, busy,
}) {
  const recList = recs?.categories?.[recCat] || [];

  return (
    <div className="feed-panel">
      {/* Strategy Overview */}
      <div className="feed-card">
        <div className="feed-card-header">
          <span style={{ fontSize: ".85rem" }}>⚡</span>
          <span className="feed-card-title">Strategy Overview</span>
          <span style={{ fontSize: ".55rem", background: "rgba(61,206,138,.15)", color: "var(--good)", borderRadius: "3px", padding: "1px 5px", fontWeight: 600 }}>auto</span>
        </div>
        <div className="feed-card-body">
          {strategyLoading && <LoadingIndicator label="Loading strategy" active />}
          {strategy && (
            <p style={{ fontSize: ".7rem", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(strategy.strategy) }} />
          )}
          {!strategy && !strategyLoading && (
            <p className="muted small">Strategy loads automatically with 20+ cards.</p>
          )}
        </div>
      </div>

      {/* Weakness Check */}
      <div className="feed-card">
        <div className="feed-card-header">
          <span style={{ fontSize: ".85rem" }}>⚠️</span>
          <span className="feed-card-title">Weakness Check</span>
          {weaknesses.length > 0 && (
            <span style={{ fontSize: ".55rem", background: "rgba(229,184,76,.15)", color: "var(--warn)", borderRadius: "3px", padding: "1px 5px", fontWeight: 600 }}>
              {weaknesses.length} flag{weaknesses.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="feed-card-body">
          {weaknesses.length === 0 && <p className="muted small">No weaknesses detected.</p>}
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
      </div>

      {/* Recommendations */}
      <div className="feed-card">
        <div className="feed-card-header">
          <span style={{ fontSize: ".85rem" }}>✨</span>
          <span className="feed-card-title">Recommendations</span>
        </div>
        <div className="feed-card-body">
          {!recs && (
            <button className="ghost small" onClick={() => onPanelClick("Recommendations")}
              disabled={busy === "Recommendations"}>
              {busy === "Recommendations" ? "Loading…" : "Load Recommendations"}
            </button>
          )}
          {recs?.categories && Object.keys(recs.categories).length > 0 && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Cut Suggestions */}
      <div className="feed-card">
        <div className="feed-card-header">
          <span style={{ fontSize: ".85rem" }}>✂️</span>
          <span className="feed-card-title">Cut Suggestions</span>
        </div>
        <div className="feed-card-body">
          {!cuts && (
            <button className="ghost small" onClick={() => onPanelClick("Cuts")}
              disabled={busy === "Cuts"}>
              {busy === "Cuts" ? "Loading…" : "Load Cut Suggestions"}
            </button>
          )}
          {cuts?.cuts?.length === 0 && <p className="muted small">No cuts suggested.</p>}
          {cuts?.cuts?.map((c) => (
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
      </div>

      {/* Combos */}
      <div className="feed-card">
        <div className="feed-card-header">
          <span style={{ fontSize: ".85rem" }}>🔗</span>
          <span className="feed-card-title">Combos</span>
          {combos?.combos?.length > 0 && (
            <span style={{ fontSize: ".55rem", background: "rgba(61,206,138,.15)", color: "var(--good)", borderRadius: "3px", padding: "1px 5px", fontWeight: 600 }}>
              {combos.combos.length} found
            </span>
          )}
        </div>
        <div className="feed-card-body">
          {!combos && (
            <button className="ghost small" onClick={() => onPanelClick("Combos")}
              disabled={busy === "Combos"}>
              {busy === "Combos" ? "Loading…" : "Find Combos"}
            </button>
          )}
          {combos && combos.combos?.length === 0 && combos.near_misses?.length === 0 && (
            <p className="muted small">No combos or near-misses found.</p>
          )}
          {combos?.combos?.map((c, i) => (
            <div key={i} className="acc-combo-row">
              <span className="badge good small">combo</span>
              <span className="small"> {c.cards?.join(" + ")}</span>
            </div>
          ))}
          {combos?.near_misses?.map((c, i) => (
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
      </div>

      {/* Upgrade Path */}
      <div className="feed-card">
        <div className="feed-card-header">
          <span style={{ fontSize: ".85rem" }}>🚀</span>
          <span className="feed-card-title">Upgrade Path</span>
        </div>
        <div className="feed-card-body">
          <div className="ai-panel-toggle" style={{ marginBottom: ".4rem" }}>
            <button className={upgradeMode === "budget" ? "active" : ""} onClick={() => setUpgradeMode("budget")}>Budget</button>
            <button className={upgradeMode === "power" ? "active" : ""} onClick={() => setUpgradeMode("power")}>Power</button>
          </div>
          {upgradeMode === "budget" && !budgetSwaps && (
            <button className="ghost small" onClick={() => onPanelClick("Upgrades")}
              disabled={busy === "Upgrades"}>
              {busy === "Upgrades" ? "Loading…" : "Load Budget Swaps"}
            </button>
          )}
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
          {upgradeMode === "power" && !upgrades && (
            <button className="ghost small" onClick={() => onPanelClick("Upgrades")}
              disabled={busy === "Upgrades"}>
              {busy === "Upgrades" ? "Loading…" : "Load Power Upgrades"}
            </button>
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
      </div>

      {/* Draw Odds */}
      <div className="feed-card">
        <div className="feed-card-header">
          <span style={{ fontSize: ".85rem" }}>🎲</span>
          <span className="feed-card-title">Draw Odds</span>
        </div>
        <div className="feed-card-body">
          <DrawProbability result={result} commander={commander} format={format} compact />
        </div>
      </div>
    </div>
  );
}
