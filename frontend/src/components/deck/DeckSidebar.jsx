import Curve from "../Curve";
import CardPreview from "../CardPreview";
import LoadingIndicator from "../LoadingIndicator";

const WUBRG = ["W", "U", "B", "R", "G", "C"];
const COLOR_NAME = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };

function statusBadge(status) {
  const s = (status || "").toUpperCase();
  if (s === "PASS" || s === "OK") return "good";
  if (s === "WARN") return "warn";
  return "bad";
}

export default function DeckSidebar({
  result, isAnalyzing, onAnalyze,
  onPlaytest, onShare, onSave,
  onRecommendations, onCombos, onBudgetSwaps, onComposition,
}) {
  const s = result?.stats || {};
  const mana = result?.mana || {};
  const legality = result?.legality || {};
  const bracket = result?.bracket || {};
  const bd = result?.breakdown || {};
  const price = bd.price_usd;

  return (
    <aside className="deck-sidebar" role="complementary" aria-label="Deck statistics">
      {/* Stats overview */}
      <div className="sidebar-section">
        <div className="stat-grid">
          <Stat k="Cards" v={result?.total_cards} />
          <Stat k="Lands" v={s.land_count} />
          <Stat k="Avg CMC" v={s.avg_cmc} />
          <Stat k="Price" v={price != null ? `$${price.toFixed(2)}` : "—"}
            sub={bd.prices_as_of ? `as of ${bd.prices_as_of}` : null} />
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

      {/* Action buttons */}
      <div className="sidebar-section sidebar-actions">
        <button className="primary" onClick={onAnalyze} disabled={isAnalyzing} style={{ width: "100%" }}>
          {isAnalyzing ? "Analyzing…" : result ? "Refresh Analysis" : "Analyze"}
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: ".3rem", marginTop: ".5rem" }}>
          {onRecommendations && <button className="ghost small" onClick={onRecommendations}>Recommendations</button>}
          {onCombos && <button className="ghost small" onClick={onCombos}>Find Combos</button>}
          {onBudgetSwaps && <button className="ghost small" onClick={onBudgetSwaps}>Budget Swaps</button>}
          {onComposition && <button className="ghost small" onClick={onComposition}>Check Composition</button>}
        </div>
      </div>

      <LoadingIndicator label="Analyzing deck" active={isAnalyzing} />
    </aside>
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

function Stat({ k, v, sub }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v ?? "—"}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}
