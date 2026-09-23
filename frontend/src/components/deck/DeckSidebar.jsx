import LoadingIndicator from "../LoadingIndicator";
import OptimizeQueue from "./OptimizeQueue";
import InsightsPanel from "./InsightsPanel";

// Sidebar layout, top to bottom: the Optimize queue, then the tabbed Insights
// toolbox (Analytics / Changes / Combos / Odds). Deck Goals and Assessment
// moved out to render inline above the card list instead (Job 6) — this rail
// now holds only what's genuinely rail-shaped: a queue you work through while
// looking at the deck, and a toolbox. The old Accordion|Feed dual modes and
// the separate Composition panel are gone — composition lives in Assessment's
// gap chips + category table (now inline, not here), and every tool renders
// at the top of the toolbox instead of expanding mid-stack. Suggest/Cuts/
// Upgrades merged into Changes, which shares the Optimize queue's changeset
// cards and its session log.
export default function DeckSidebar({
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
  // Hub tabs render this sidebar twice via portals: the Optimize tab shows the
  // goal-driven surface, the Stats tab the insights toolbox. Desktop renders both.
  const showOpt = section !== "stats";
  const showStats = section !== "optimize";

  return (
    <aside className="deck-sidebar" role="complementary" aria-label="Deck statistics">
      {showOpt && (
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

      {showStats && (
        <InsightsPanel
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
      )}

      <LoadingIndicator label="Analyzing deck" active={isAnalyzing} />
    </aside>
  );
}
