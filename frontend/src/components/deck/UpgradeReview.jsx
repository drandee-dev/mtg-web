import { useState } from "react";
import { useFocusTrap } from "../../lib/hooks";
import { useBackClose } from "../../lib/backstack";
import CardPreview from "../CardPreview";
import LoadingIndicator from "../LoadingIndicator";
import DeckGoals from "./DeckGoals";

const STEPS = ["Your game plan", "Bracket & ratings"];

// ponytail: the backend prompt only ever reads the first 15 names
// (mtg.py: ai_explain_recommendations slices card_names[:15]), so sending
// more here would silently waste the request. Add a card picker if rating a
// specific slice of a long list ever matters more than "the first 15".
const RATE_LIMIT = 15;

/** Guided review over a freshly-pasted decklist: state the game plan, see the
 * bracket it reads as plus per-card AI ratings, then jump into the existing
 * Changes queue for swaps. Every payoff already exists (DeckGoals, analyze's
 * bracket detection, aiExplain, the Changes tab) — this only sequences them
 * in the order an upgrade flow needs. Opens once, right after a paste import
 * lands on a previously-empty deck (see DeckView's handleImportText). */
export default function UpgradeReview({
  open, onClose, goals, setGoals, deckCardNames, result, onLoadRatings, onGoToChanges,
}) {
  if (!open) return null;
  return (
    <ModalInner
      goals={goals} setGoals={setGoals} deckCardNames={deckCardNames}
      result={result} onClose={onClose}
      onLoadRatings={onLoadRatings} onGoToChanges={onGoToChanges}
    />
  );
}

function ModalInner({ goals, setGoals, deckCardNames, result, onClose, onLoadRatings, onGoToChanges }) {
  const [step, setStep] = useState(0);
  const [ratings, setRatings] = useState(null); // null | {loading} | {explanations} | {error}
  const panelRef = useFocusTrap(true);
  useBackClose(true, onClose);

  const bracket = result?.bracket;
  const names = (deckCardNames || []).slice(0, RATE_LIMIT);
  const truncated = (deckCardNames || []).length > RATE_LIMIT;

  async function rateCards() {
    setRatings({ loading: true });
    try {
      const r = await onLoadRatings(names);
      if (r.error) setRatings({ error: r.message || "Rating failed." });
      else setRatings({ explanations: r.explanations || [] });
    } catch (e) {
      setRatings({ error: e.message });
    }
  }

  return (
    <div className="icm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="icm-panel upr-panel" role="dialog" aria-modal="true" aria-label="Upgrade this deck" ref={panelRef} tabIndex={-1}>
        <div className="icm-head">
          <h3>Upgrade this deck</h3>
          <button className="icm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="gen-progress upr-progress">
          <div className="gen-progress-row">
            <span className="gen-step">Step {step + 1} of {STEPS.length} — {STEPS[step]}</span>
            <span className="gen-pct">{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
          </div>
          <div className="gen-track"><div className="gen-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        </div>

        <div className="icm-body upr-body">
          {step === 0 && (
            <>
              <p className="upr-lede">
                One sentence on what this deck should do makes the ratings and
                swaps that follow specific to this deck, not a generic list.
              </p>
              <DeckGoals goals={goals} setGoals={setGoals} deckCardNames={deckCardNames} defaultOpen />
            </>
          )}

          {step === 1 && (
            <>
              {bracket ? (
                <div className="upr-bracket">
                  <span className={`badge ${bracket.bracket >= 4 ? "warn" : "good"}`}>
                    Bracket {bracket.bracket}{bracket.name ? ` — ${bracket.name}` : ""}
                  </span>
                  {bracket.game_changers?.length > 0 && (
                    <p className="small muted">Game changers: {bracket.game_changers.join(", ")}</p>
                  )}
                  {bracket.mass_land_denial?.length > 0 && (
                    <p className="small muted">Mass land denial: {bracket.mass_land_denial.join(", ")}</p>
                  )}
                </div>
              ) : (
                <p className="muted small">Analyzing your decklist…</p>
              )}

              {!ratings && (
                <button className="insp-deep" onClick={rateCards} disabled={!names.length}>
                  <span>Rate my {names.length} card{names.length === 1 ? "" : "s"}</span>
                  <span className="insp-deep-badge">Uses AI</span>
                </button>
              )}
              {truncated && !ratings && (
                <p className="small muted">Rates the first {RATE_LIMIT} cards in the list.</p>
              )}

              {ratings?.loading && <LoadingIndicator label="Rating cards" active />}
              {ratings?.error && <p className="small upr-error">{ratings.error}</p>}
              {ratings?.explanations?.map((c, i) => (
                <div className="gen-card-row" key={c.name || i}>
                  <span className="gen-card-name"><CardPreview name={c.name} /></span>
                  <span className="gen-card-why">{c.explanation}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="icm-foot">
          {step === 0 && (
            <>
              <button className="ghost small" onClick={onClose}>Skip</button>
              <button className="primary small" onClick={() => setStep(1)}>Continue</button>
            </>
          )}
          {step === 1 && (
            <>
              <button className="ghost small" onClick={onClose}>Close</button>
              <button className="primary small" onClick={onGoToChanges}>See suggested swaps →</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
