import LoadingIndicator from "../LoadingIndicator";
import OptimizeQueue from "./OptimizeQueue";
import InsightsPanel from "./InsightsPanel";

// The tools in two of the deck's sections (UX overhaul job 3.1; this was the
// right sidebar, and on phones two tabs of the Planeswalker). Improve: the
// Optimize queue, then Changes (EDHREC suggestions, cuts, budget swaps),
// which shares the queue's changeset cards and its session log. Stats: the
// Insights toolbox without Changes (Analytics / Combos / Odds). Deck Goals
// and the Assessment sit above these in Improve, rendered by DeckView.
export default function DeckTools({
  result, isAnalyzing,
  activePanel, onPanelClick, onRefreshPanel, busy, stalePanels,
  recs, recCat, setRecCat, skipped, onClearSkipped, onAddCard,
  pinned, onTogglePin,
  combos, comp, budgetSwaps,
  dismissedCuts, onClearDismissedCuts,
  declinedUpgrades, onClearDeclinedUpgrades, insightDecided, onLoadDeepChanges,
  upgradeMode, setUpgradeMode,
  onApplyInsightChange, onSkipInsightChange,
  commander, format,
  serverWarmed,
  optimize, optimizing, onRunOptimize, optGapCount, optDecided,
  onApplyChange, onSkipChange, optLog, onUndoChange, onClearLog,
  onGoldfish, section,
}) {
  const improve = section === "improve";

  return (
    <div className="deck-tools">
      {improve && (
        <>
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

      {/* Named here because in Improve it has no tab to name it. */}
      {improve && <h3 className="deck-tools-head">Suggested changes</h3>}
      <InsightsPanel
        tools={improve ? ["Changes"] : ["Analytics", "Combos", "DrawOdds"]}
        result={result}
        comp={comp}
        activePanel={activePanel}
        onPanelClick={onPanelClick}
        onRefreshPanel={onRefreshPanel}
        busy={busy}
        stalePanels={stalePanels}
        recs={recs}
        recCat={recCat}
        setRecCat={setRecCat}
        skipped={skipped}
        onClearSkipped={onClearSkipped}
        pinned={pinned}
        onTogglePin={onTogglePin}
        onAddCard={onAddCard}
        dismissedCuts={dismissedCuts}
        onClearDismissedCuts={onClearDismissedCuts}
        declinedUpgrades={declinedUpgrades}
        insightDecided={insightDecided}
        onLoadDeepChanges={onLoadDeepChanges}
        onClearDeclinedUpgrades={onClearDeclinedUpgrades}
        combos={combos}
        onGoldfish={onGoldfish}
        optimize={optimize}
        budgetSwaps={budgetSwaps}
        upgradeMode={upgradeMode}
        setUpgradeMode={setUpgradeMode}
        onApplyChange={onApplyInsightChange}
        onSkipChange={onSkipInsightChange}
        commander={commander}
        format={format}
      />

      <LoadingIndicator label="Analyzing deck" active={isAnalyzing} />
    </div>
  );
}
