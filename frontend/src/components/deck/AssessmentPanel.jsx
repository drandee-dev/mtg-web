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
    { label: "Legal", w: 0.20, v: result.legality?.overall_status === "FAIL" ? 0.4 : 1 },
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

function joinNames(list) {
  const names = list.map((c) => c.label.toLowerCase());
  if (names.length < 3) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Two plain sentences from numbers the page already has, so the Verdict never
// goes stale the way a written strategy can. The AI pass's own read of the
// deck replaces it when that pass has run for the cards on screen (`aiNote`).
function verdictText({ thin, hasCats, detected, target }) {
  const out = [];
  if (thin.length) out.push(`${joinNames(thin).replace(/^./, (m) => m.toUpperCase())} ${thin.length === 1 ? "is" : "are"} under target.`);
  else if (hasCats) out.push("Every role is at its target.");
  if (detected != null && target != null && detected !== target) {
    out.push(`The deck reads as bracket ${detected}; your goal is ${target}.`);
  }
  return out.join(" ");
}

// Improve's left column under Goals (UX overhaul job 3.5, `Improve`): the
// Verdict, a score out of 100 with a sentence, and the Gaps, the roles under
// target. A gap is a button: it asks the AI for cards that fill it (wired
// through DeckView's runOptimize). The over-budget line sits beside them as
// the same kind of one-tap route, to budget swaps.
export default function AssessmentPanel({
  result, comp, goals, aiNote, onGapChip, optimizing, onOverBudget,
}) {
  const detected = result?.bracket?.bracket ?? null;
  const target = goals?.bracketTarget ?? null;
  const thin = comp?.categories?.filter((c) => c.status === "thin") || [];
  // Over budget vs the user's declared ceiling → one-tap route to Budget swaps.
  const price = result?.breakdown?.price_usd ?? null;
  const ceiling = goals?.budgetCeiling ?? null;
  const overBy = price != null && ceiling != null && price > ceiling ? price - ceiling : 0;
  const health = computeHealth(result, comp);
  const text = aiNote || verdictText({ thin, hasCats: Boolean(comp?.categories?.length), detected, target });
  if (!health && !text && !thin.length && !overBy) return null;

  const tone = health ? (health.score >= 80 ? "good" : health.score >= 55 ? "warn" : "bad") : "";
  return (
    <div className="asmt-wrap">
      <section aria-labelledby="improve-verdict">
        <h3 id="improve-verdict" className="improve-h">Verdict</h3>
        {health && (
          <div className="asmt-score-row"
            title={health.parts.map((p) => `${p.label} ${Math.round(p.v * 100)}%`).join(" · ")}>
            <span className={`hr-score hr-${tone}`}>{health.score}</span>
            <span className="muted">out of 100</span>
          </div>
        )}
        {text && <p className="asmt-verdict">{text}</p>}
      </section>

      {overBy > 0 && (
        <button
          className="asmt-chip asmt-chip-budget"
          disabled={!onOverBudget}
          onClick={() => onOverBudget?.()}
          title="Open Budget swaps to bring the price down"
        >
          <span className="asmt-chip-label">${Math.round(overBy)} over your ${Math.round(ceiling)} budget</span>
          <span className="asmt-chip-count">swaps →</span>
        </button>
      )}

      {thin.length > 0 && (
        <section aria-labelledby="improve-gaps">
          <h3 id="improve-gaps" className="improve-h">Gaps</h3>
          <div className="asmt-gaps">
            {thin.map((c) => (
              <button
                key={c.key}
                className="asmt-chip"
                disabled={optimizing || !onGapChip}
                onClick={() => onGapChip?.(c.key)}
                title={`Ask the AI for ${c.label.toLowerCase()} suggestions`}
              >
                <span className="asmt-chip-label">{c.label}</span>
                <span className="asmt-chip-count">
                  {c.count}{c.target ? ` of ${c.target}` : ""}{c.light > 0 ? ` (${c.light} light)` : ""}
                </span>
                <svg className="asmt-chip-zap" aria-hidden="true" viewBox="0 0 24 24" width="10" height="10"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
