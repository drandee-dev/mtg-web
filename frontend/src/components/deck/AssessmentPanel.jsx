import LoadingIndicator from "../LoadingIndicator";
import { sanitizeHtml } from "../../lib/sanitize";

function statusScore(s) {
  const u = (s || "").toUpperCase();
  if (u === "PASS" || u === "OK") return 1;
  if (u === "WARN") return 0.6;
  return 0.3;
}

// A single 0–100 "deck health" read — the progress signal the sidebar was missing.
// Weighs completeness, legality, mana viability, color fixing, and role coverage;
// each input already comes from the deterministic audits, so the number moves the
// moment the deck improves. Returns null until there's a deck to score.
function computeHealth(result, comp) {
  if (!result || !result.total_cards) return null;
  const fmt = result.format || "commander";
  const isCmdr = fmt === "commander" || fmt === "paupercommander";
  const target = isCmdr ? 100 : 60;
  const parts = [
    { label: "Complete", w: 0.25, v: Math.min(1, (result.total_cards || 0) / target) },
    { label: "Legal", w: 0.20, v: result.legality?.violations?.length ? 0.4 : 1 },
    { label: "Mana", w: 0.20, v: statusScore(result.mana?.viability?.status) },
    { label: "Fixing", w: 0.15, v: statusScore(result.mana?.color_balance_status) },
  ];
  const cats = comp?.categories?.filter((c) => c.target) || [];
  if (cats.length) {
    const thin = cats.filter((c) => c.status === "thin").length;
    parts.push({ label: "Roles", w: 0.20, v: 1 - thin / cats.length });
  }
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const score = Math.round((parts.reduce((a, p) => a + p.w * p.v, 0) / wsum) * 100);
  return { score, parts };
}

function HealthRing({ score, parts }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const tone = score >= 80 ? "good" : score >= 55 ? "warn" : "bad";
  const title = parts.map((p) => `${p.label} ${Math.round(p.v * 100)}%`).join(" · ");
  return (
    <div className={`health-ring hr-${tone}`} title={title}
      role="img" aria-label={`Deck health ${score} of 100 — ${title}`}>
      <svg viewBox="0 0 48 48" width="46" height="46">
        <circle className="hr-track" cx="24" cy="24" r={r} fill="none" strokeWidth="4" />
        <circle className="hr-fill" cx="24" cy="24" r={r} fill="none" strokeWidth="4"
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)} transform="rotate(-90 24 24)" />
      </svg>
      <span className="hr-score">{score}</span>
    </div>
  );
}

// Deck assessment: bracket meter (detected vs goal target), auto strategy
// summary, and tappable gap chips. Tapping a chip runs a focused Optimize
// pass for that category (wired through DeckView's runOptimize).
export default function AssessmentPanel({
  result, strategy, strategyLoading, comp, goals, onGapChip, optimizing,
  onOverBudget,
}) {
  const detected = result?.bracket?.bracket ?? null;
  const target = goals?.bracketTarget ?? null;
  const thin = comp?.categories?.filter((c) => c.status === "thin") || [];
  const hasMeter = detected != null || target != null;
  // Over budget vs the user's declared ceiling → one-tap route to Budget swaps.
  const price = result?.breakdown?.price_usd ?? null;
  const ceiling = goals?.budgetCeiling ?? null;
  const overBy = price != null && ceiling != null && price > ceiling ? price - ceiling : 0;
  const health = computeHealth(result, comp);
  if (!health && !hasMeter && !thin.length && !strategy && !strategyLoading && !overBy) return null;

  return (
    <div className="sidebar-section asmt">
      <div className="asmt-head">
        <div className="asmt-head-text">
          <span className="asmt-title">Assessment</span>
          {detected != null && (
            <span className="asmt-sub">
              bracket {detected}{target != null ? ` → target ${target}` : ""}
            </span>
          )}
        </div>
        {health && <HealthRing score={health.score} parts={health.parts} />}
      </div>

      {hasMeter && (
        <div
          className="asmt-meter"
          role="img"
          aria-label={`Power bracket: ${detected != null ? `currently ${detected}` : "not detected"}${target != null ? `, target ${target}` : ""} of 5`}
        >
          {[1, 2, 3, 4, 5].map((b) => (
            <span
              key={b}
              className={`asmt-seg${detected != null && b <= detected ? " fill" : ""}${target === b ? " tgt" : ""}`}
            >
              {b}
            </span>
          ))}
        </div>
      )}

      {strategyLoading && <LoadingIndicator label="Reading strategy" active />}
      {strategy?.strategy && (
        <p
          className="asmt-strategy"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(strategy.strategy) }}
        />
      )}

      {overBy > 0 && (
        <button
          className="asmt-chip asmt-chip-budget"
          disabled={!onOverBudget}
          onClick={() => onOverBudget?.()}
          title="Open Budget swaps to bring the price down"
        >
          <span className="asmt-chip-label">💸 ${Math.round(overBy)} over your ${Math.round(ceiling)} budget</span>
          <span className="asmt-chip-count">swaps →</span>
        </button>
      )}

      {thin.length > 0 && (
        <div className="asmt-gaps">
          {thin.map((c) => (
            <button
              key={c.key}
              className="asmt-chip"
              disabled={optimizing || !onGapChip}
              onClick={() => onGapChip?.(c.key)}
              title={`Queue ${c.label.toLowerCase()} suggestions`}
            >
              <span className="asmt-chip-label">{c.label}</span>
              <span className="asmt-chip-count">
                {c.count}{c.target ? `/${c.target}` : ""}
              </span>
              <svg className="asmt-chip-zap" aria-hidden="true" viewBox="0 0 24 24" width="10" height="10"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {/* Full category table (absorbed the old Composition panel) */}
      {comp?.categories?.length > 0 && (
        <details className="asmt-comp">
          <summary>Category targets</summary>
          <div className="asmt-comp-grid">
            {comp.categories.map((c) => (
              <div className="asmt-comp-row" key={c.key}>
                <span>{c.label}</span>
                <span className="asmt-comp-val">
                  <strong>{c.count}</strong>
                  {c.target ? <span className="muted">/{c.target}</span> : null}
                  {c.status === "thin" && <span className="asmt-comp-thin">thin</span>}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
