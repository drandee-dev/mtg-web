import DeckGoals from "./DeckGoals";
import AssessmentPanel from "./AssessmentPanel";

// Improve's left column (job 3.5): Goals, then the Verdict and Gaps. DeckView
// renders it once, beside the Suggested changes list.
export default function DeckGoalsAssessment({
  goals, setGoals, deckCardNames, goalSuggestion,
  onAcceptGoalSuggestion, onDismissGoalSuggestion, goalsOpen, onToggleGoals,
  result, verdictNote, comp, onGapChip, optimizing, onOverBudget,
}) {
  return (
    <div className="deck-goals-assessment">
      {goals && setGoals && (
        <DeckGoals
          goals={goals}
          setGoals={setGoals}
          deckCardNames={deckCardNames || []}
          suggestion={goalSuggestion}
          onAcceptSuggestion={onAcceptGoalSuggestion}
          onDismissSuggestion={onDismissGoalSuggestion}
          open={goalsOpen}
          onToggle={onToggleGoals}
        />
      )}

      <AssessmentPanel
        result={result}
        aiNote={verdictNote}
        comp={comp}
        goals={goals}
        onGapChip={onGapChip}
        optimizing={optimizing}
        onOverBudget={onOverBudget}
      />
    </div>
  );
}
