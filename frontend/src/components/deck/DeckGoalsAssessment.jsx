import DeckGoals from "./DeckGoals";
import AssessmentPanel from "./AssessmentPanel";

// Deck Goals + Assessment, moved out of the rail (Job 6) and rendered inline
// above the card list, collapsed by default. Rendered twice from DeckView —
// once in the normal page flow, once portaled into the mobile Planeswalker
// hub's Optimize tab (that sheet covers up to 85dvh of the viewport, so the
// inline copy is not reliably visible while it's open) — sharing the same
// collapse-state props from DeckView so both copies stay in sync.
export default function DeckGoalsAssessment({
  goals, setGoals, deckCardNames, goalSuggestion,
  onAcceptGoalSuggestion, onDismissGoalSuggestion, goalsOpen, onToggleGoals,
  result, strategy, strategyLoading, comp, onGapChip, optimizing, onOverBudget,
  assessmentOpen, onToggleAssessment,
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
        strategy={strategy}
        strategyLoading={strategyLoading}
        comp={comp}
        goals={goals}
        onGapChip={onGapChip}
        optimizing={optimizing}
        onOverBudget={onOverBudget}
        open={assessmentOpen}
        onToggle={onToggleAssessment}
      />
    </div>
  );
}
