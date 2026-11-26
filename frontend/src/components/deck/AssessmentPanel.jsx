import { Fragment } from "react";
import { useInfoTip } from "../InfoTip";
import { statusParts } from "../../lib/deckStatus";

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
// Verdict, a status line with a sentence, and the Gaps, the roles under
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
  const status = statusParts(result, comp);
  const text = aiNote || verdictText({ thin, hasCats: Boolean(comp?.categories?.length), detected, target });
  // Hooks before the early return.
  const statusTip = useInfoTip("the status",
    "The deck's own checks, in order: legality, then the card count when the deck is short, "
    + "the mana base (lands against this deck's land floor, then lands plus ramp against its curve), "
    + "color fixing when it is weak, and how many roles are under target.");
  const gapsTip = useInfoTip("gaps",
    "Roles with fewer cards than this deck should run; the number after \"of\" is the target. "
    + "Tap one to ask the AI for cards that fill it. Each tap uses an AI call.");
  if (!status && !text && !thin.length && !overBy) return null;

  return (
    <div className="asmt-wrap">
      <section aria-labelledby="improve-verdict">
        <div className="info-tip-host info-tip-head">
          <h3 id="improve-verdict" className="improve-h">Verdict</h3>
          {status && statusTip.button}
          {status && statusTip.panel}
        </div>
        {status && (
          <p className="asmt-status">
            {status.map((p, i) => (
              <Fragment key={p.text}>
                {i > 0 && (
                  <>
                    <span className="visually-hidden">, </span>
                    <span className="asmt-status-sep" aria-hidden="true"> · </span>
                  </>
                )}
                <span className={`asmt-status-${p.tone}`}>{p.text}</span>
              </Fragment>
            ))}
          </p>
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
          <div className="info-tip-host info-tip-head">
            <h3 id="improve-gaps" className="improve-h">Gaps</h3>
            {gapsTip.button}
            {gapsTip.panel}
          </div>
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
