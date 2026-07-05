import { useState } from "react";
import { goalsSummary, FLAVOR_SUGGESTIONS } from "../../lib/goals";

const BRACKETS = [1, 2, 3, 4, 5];
const PILOTS = [["simple", "Simple"], ["moderate", "Moderate"], ["any", "Any"]];
const BUDGET_PRESETS = [50, 100, 275, 500];

// Deck Goals editor — collapsed summary chips, expandable editor. Every AI
// feature (cuts, fills, upgrades, chat) reads these goals. When no goals are
// set yet, a one-time banner offers the deck's analyzed reality (detected
// bracket, price + headroom) as a starting goal set — one tap to adopt.
export default function DeckGoals({
  goals, setGoals, deckCardNames = [],
  suggestion, onAcceptSuggestion, onDismissSuggestion,
}) {
  const [open, setOpen] = useState(false);
  const [protectQuery, setProtectQuery] = useState("");
  const [customBudget, setCustomBudget] = useState("");

  const set = (patch) => setGoals({ ...goals, ...patch });
  const chips = goalsSummary(goals);

  const protectMatches = protectQuery.trim().length >= 2
    ? deckCardNames
        .filter((n) => n.toLowerCase().includes(protectQuery.toLowerCase()) && !goals.protected.includes(n))
        .slice(0, 5)
    : [];

  function addProtected(name) {
    if (goals.protected.length >= 15 || goals.protected.includes(name)) return;
    set({ protected: [...goals.protected, name] });
    setProtectQuery("");
  }

  function addSuggestion(text) {
    const note = goals.flavorNote.trim();
    if (note.includes(text)) return;
    set({ flavorNote: note ? `${note} ${text}` : text });
  }

  return (
    <div className="deck-goals">
      <button
        className="dg-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="dg-title">Deck goals</span>
        {!open && (
          <span className="dg-chips">
            {chips.length
              ? chips.map((c) => <span key={c} className="dg-chip on">{c}</span>)
              : <span className="dg-empty">none set — AI optimizes generically</span>}
          </span>
        )}
        <span className="dg-toggle">{open ? "Done" : "Edit"}</span>
      </button>

      {!open && suggestion && (
        <div className="dg-suggest-bar">
          <span className="dg-suggest-text">
            Suggested from your deck:
            {suggestion.bracketTarget != null && <strong> bracket {suggestion.bracketTarget}</strong>}
            {suggestion.bracketTarget != null && suggestion.budgetCeiling != null && " ·"}
            {suggestion.budgetCeiling != null && <strong> ≤ ${suggestion.budgetCeiling}</strong>}
          </span>
          <span className="dg-suggest-actions">
            <button className="dg-suggest-use" onClick={onAcceptSuggestion}>Use these</button>
            <button className="dg-suggest-edit" onClick={() => setOpen(true)}>Edit</button>
            <button className="dg-suggest-x" aria-label="Dismiss suggested goals" onClick={onDismissSuggestion}>✕</button>
          </span>
        </div>
      )}

      {open && (
        <div className="dg-body">
          <div className="dg-row">
            <span className="dg-key">Bracket</span>
            <div className="dg-opts" role="group" aria-label="Target bracket">
              <button
                className={`dg-chip${goals.bracketTarget == null ? " on" : ""}`}
                onClick={() => set({ bracketTarget: null })}
              >keep current</button>
              {BRACKETS.map((b) => (
                <button
                  key={b}
                  className={`dg-chip${goals.bracketTarget === b ? " on" : ""}`}
                  onClick={() => set({ bracketTarget: goals.bracketTarget === b ? null : b })}
                >{b}</button>
              ))}
            </div>
          </div>

          <div className="dg-row">
            <span className="dg-key">Budget</span>
            <div className="dg-opts" role="group" aria-label="Budget ceiling">
              <button
                className={`dg-chip${goals.budgetCeiling == null ? " on" : ""}`}
                onClick={() => set({ budgetCeiling: null })}
              >none</button>
              {BUDGET_PRESETS.map((b) => (
                <button
                  key={b}
                  className={`dg-chip${goals.budgetCeiling === b ? " on" : ""}`}
                  onClick={() => set({ budgetCeiling: goals.budgetCeiling === b ? null : b })}
                >${b}</button>
              ))}
              <input
                className="dg-custom"
                inputMode="numeric"
                placeholder="$…"
                value={customBudget}
                onChange={(e) => setCustomBudget(e.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customBudget) {
                    set({ budgetCeiling: parseInt(customBudget, 10) });
                    setCustomBudget("");
                  }
                }}
                aria-label="Custom budget ceiling in dollars"
              />
            </div>
          </div>

          <div className="dg-row">
            <span className="dg-key">Pilot</span>
            <div className="dg-opts" role="group" aria-label="Pilot complexity">
              {PILOTS.map(([id, label]) => (
                <button
                  key={id}
                  className={`dg-chip${goals.pilot === id ? " on" : ""}`}
                  onClick={() => set({ pilot: id })}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className="dg-row">
            <span className="dg-key">Protect</span>
            <div className="dg-protect">
              {goals.protected.length > 0 && (
                <div className="dg-opts">
                  {goals.protected.map((name) => (
                    <span key={name} className="dg-chip on dg-prot">
                      {name}
                      <button
                        className="dg-prot-x"
                        aria-label={`Stop protecting ${name}`}
                        onClick={() => set({ protected: goals.protected.filter((p) => p !== name) })}
                      >✕</button>
                    </span>
                  ))}
                </div>
              )}
              <input
                className="dg-custom dg-prot-input"
                value={protectQuery}
                onChange={(e) => setProtectQuery(e.target.value)}
                placeholder="Type a card in this deck…"
                aria-label="Search deck for a card to protect"
              />
              {protectMatches.length > 0 && (
                <div className="dg-prot-matches">
                  {protectMatches.map((n) => (
                    <button key={n} className="dg-prot-match" onClick={() => addProtected(n)}>{n}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="dg-row dg-row-note">
            <span className="dg-key">Note</span>
            <div className="dg-protect">
              <textarea
                className="dg-note"
                value={goals.flavorNote}
                onChange={(e) => set({ flavorNote: e.target.value.slice(0, 300) })}
                placeholder='Deck identity the AI must respect — e.g. "Mutate tribal, flavor over power."'
                rows={2}
                aria-label="Deck identity note"
              />
              <div className="dg-opts">
                {FLAVOR_SUGGESTIONS.filter((s) => !goals.flavorNote.includes(s)).map((s) => (
                  <button key={s} className="dg-chip dg-suggest" onClick={() => addSuggestion(s)}>+ {s.replace(/\.$/, "")}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
