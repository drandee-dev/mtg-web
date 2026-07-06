import LoadingIndicator from "../LoadingIndicator";
import DeckGoals from "./DeckGoals";
import OptimizeQueue from "./OptimizeQueue";
import AssessmentPanel from "./AssessmentPanel";
import InsightsPanel from "./InsightsPanel";

// Sidebar layout, top to bottom: the goal-driven copilot spine (Goals →
// Assessment → Optimize queue), then the tabbed Insights toolbox (Analytics /
// Suggest / Cuts / Combos / Upgrades / Odds). The old Accordion|Feed dual
// modes and the separate Composition panel are gone — composition lives in
// Assessment's gap chips + category table, and every tool renders at the top
// of the toolbox instead of expanding mid-stack.
export default function DeckSidebar({
  result, isAnalyzing,
  activePanel, onPanelClick, onRefreshPanel, busy,
  recs, recCat, setRecCat, skipped, onSkip, onAddCard,
  combos, comp, budgetSwaps, onSwapCard,
  cuts, onRemoveCard,
  upgrades, upgradeMode, setUpgradeMode,
  commander, format,
  strategy, strategyLoading,
  serverWarmed,
  goals, setGoals, deckCardNames,
  goalSuggestion, onAcceptGoalSuggestion, onDismissGoalSuggestion,
  optimize, optimizing, onRunOptimize, optGapCount, optDecided,
  onApplyChange, onSkipChange, optLog, onUndoChange, onClearLog,
  onGapChip, onOverBudget, section,
}) {
  // Hub tabs render this sidebar twice via portals: the Optimize tab shows the
  // goal-driven surface, the Stats tab the insights toolbox. Desktop renders both.
  const showOpt = section !== "stats";
  const showStats = section !== "optimize";

  return (
    <aside className="deck-sidebar" role="complementary" aria-label="Deck statistics">
      {showOpt && (
        <>
          {/* Deck Goals — user-declared intent that every AI feature reads */}
          {goals && setGoals && (
            <DeckGoals
              goals={goals}
              setGoals={setGoals}
              deckCardNames={deckCardNames || []}
              suggestion={goalSuggestion}
              onAcceptSuggestion={onAcceptGoalSuggestion}
              onDismissSuggestion={onDismissGoalSuggestion}
            />
          )}

          {/* Assessment — bracket meter vs target, strategy, gap chips + category table */}
          <AssessmentPanel
            result={result}
            strategy={strategy}
            strategyLoading={strategyLoading}
            comp={comp}
            goals={goals}
            onGapChip={onGapChip}
            optimizing={optimizing}
            onOverBudget={onOverBudget}
          />

          {/* Optimize queue — goal-aware changeset with Apply/Skip + session log */}
          {onRunOptimize && (
            <OptimizeQueue
              optimize={optimize}
              optimizing={optimizing}
              onRun={onRunOptimize}
              gapCount={optGapCount || 0}
              decided={optDecided || {}}
              onApply={onApplyChange}
              onSkip={onSkipChange}
              log={optLog || []}
              onUndo={onUndoChange}
              onClearLog={onClearLog}
            />
          )}

          {!serverWarmed && (
            <div className="sidebar-warming-pill">⚡ Still warming up — first analysis may take a moment</div>
          )}
        </>
      )}

      {showStats && (
        <InsightsPanel
          result={result}
          activePanel={activePanel}
          onPanelClick={onPanelClick}
          onRefreshPanel={onRefreshPanel}
          busy={busy}
          recs={recs}
          recCat={recCat}
          setRecCat={setRecCat}
          skipped={skipped}
          onSkip={onSkip}
          onAddCard={onAddCard}
          cuts={cuts}
          onRemoveCard={onRemoveCard}
          combos={combos}
          budgetSwaps={budgetSwaps}
          upgrades={upgrades}
          upgradeMode={upgradeMode}
          setUpgradeMode={setUpgradeMode}
          onSwapCard={onSwapCard}
          commander={commander}
          format={format}
        />
      )}

      <LoadingIndicator label="Analyzing deck" active={isAnalyzing} />
    </aside>
  );
}
