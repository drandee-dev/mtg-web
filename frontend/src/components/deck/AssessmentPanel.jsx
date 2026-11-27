import { useInfoTip } from "../InfoTip";
import { statusParts } from "../../lib/deckStatus";

const cards = (n) => `${n} card${n === 1 ? "" : "s"}`;
const capital = (s) => s.replace(/^./, (m) => m.toUpperCase());

// One plain sentence from numbers the page already has, for the one thing the
// lines below it do not say: the bracket against the goal. The AI pass's own
// read of the deck replaces it when that pass has run for the cards on screen
// (`aiNote`). The roles need no sentence: each has its own line.
function verdictText({ detected, target }) {
  return detected != null && target != null && detected !== target
    ? `The deck reads as bracket ${detected}; your goal is ${target}.`
    : "";
}

const roleCount = (c) => `${c.count}${c.target ? ` of ${c.target}` : ""}${c.light > 0 ? ` (${c.light} light)` : ""}`;

// Improve's left column under Goals (layout A, audit job 6.2): what the deck
// is built around, then its Health. Health is the deck's own checks as short
// lines, a sentence, and every role with its count against the target. A role
// under target is a button: it asks the AI for cards that fill it (wired
// through DeckView's runOptimize). The over-budget line sits with them as the
// same kind of one-tap route, to budget swaps.
export default function AssessmentPanel({
  result, comp, goals, aiNote, onGapChip, optimizing, onOverBudget,
}) {
  const detected = result?.bracket?.bracket ?? null;
  const target = goals?.bracketTarget ?? null;
  const roles = comp?.categories?.filter((c) => c.target) || [];
  const theme = comp?.theme || [];
  const tribe = theme.find((g) => g.creatures != null);
  // Over budget vs the user's declared ceiling → one-tap route to Budget swaps.
  const price = result?.breakdown?.price_usd ?? null;
  const ceiling = goals?.budgetCeiling ?? null;
  const overBy = price != null && ceiling != null && price > ceiling ? price - ceiling : 0;
  // The role rows below already say how many lands and which roles are short.
  const status = statusParts(result, comp)
    ?.filter((p) => !roles.length || (p.key !== "lands" && p.key !== "roles"));
  const text = aiNote || verdictText({ detected, target });
  // Hooks before the early return.
  const healthTip = useInfoTip("health",
    "The deck's own checks, in order: legality, then the card count when the deck is short, "
    + "the mana base (lands plus ramp against its curve) and color fixing when it is weak. "
    + "Under them, each role with how many cards fill it; the number after “of” is the target, "
    + "and Lands counts against this deck's land floor. "
    + "Tap a role that is under target to ask the AI for cards that fill it. Each tap uses an AI call.");
  const hasHealth = Boolean(status?.length || text || roles.length || overBy);
  if (!theme.length && !hasHealth) return null;

  return (
    <div className="asmt-wrap">
      {theme.length > 0 && (
        <section aria-labelledby="improve-theme">
          <h3 id="improve-theme" className="improve-h">This deck is</h3>
          <ul className="asmt-theme">
            {theme.map((g) => (
              <li key={g.label} className={`asmt-theme-chip${g === tribe ? " asmt-theme-tribe" : ""}`}>
                <span className="asmt-theme-label">{g.label}</span>
                <span className="asmt-theme-count">{cards(g.count)}</span>
              </li>
            ))}
          </ul>
          <p className="asmt-note">
            {tribe && tribe.count > tribe.creatures
              && `${tribe.creatures} ${tribe.label} and ${cards(tribe.count - tribe.creatures)} that make or support them. `}
            Read from your commander and the list.
          </p>
        </section>
      )}

      {hasHealth && (
        <section aria-labelledby="improve-health">
          <div className="info-tip-host info-tip-head">
            <h3 id="improve-health" className="improve-h">Health</h3>
            {healthTip.button}
            {healthTip.panel}
          </div>
          {status?.length > 0 && (
            <ul className="asmt-status">
              {status.map((p) => (
                <li key={p.key}><span className={`asmt-status-${p.tone}`}>{capital(p.text)}</span></li>
              ))}
            </ul>
          )}
          {text && <p className="asmt-verdict">{text}</p>}

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

          {roles.length > 0 && (
            <div className="asmt-gaps">
              {roles.map((c) => (c.status === "thin" ? (
                <button
                  key={c.key}
                  className="asmt-chip"
                  disabled={optimizing || !onGapChip}
                  onClick={() => onGapChip?.(c.key)}
                  title={`Ask the AI for ${c.label.toLowerCase()} suggestions`}
                >
                  <span className="asmt-chip-label">{c.label}</span>
                  <span className="asmt-chip-count">
                    {roleCount(c)}<span className="visually-hidden">, under target</span>
                  </span>
                  <svg className="asmt-chip-zap" aria-hidden="true" viewBox="0 0 24 24" width="10" height="10"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </button>
              ) : (
                <div key={c.key} className="asmt-row">
                  <span className="asmt-chip-label">{c.label}</span>
                  <span className="asmt-row-count">{roleCount(c)}</span>
                </div>
              )))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
