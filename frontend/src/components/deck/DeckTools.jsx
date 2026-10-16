import LoadingIndicator from "../LoadingIndicator";
import InsightsPanel from "./InsightsPanel";
import SessionLog from "./SessionLog";

// The tools in two of the deck's sections (UX overhaul job 3.1; this was the
// right sidebar, and on phones two tabs of the Planeswalker). Improve: the
// Suggested changes list (EDHREC suggestions, the AI pass, budget swaps, all
// one list of cards with Apply and Skip), then the session log. Stats: the
// Insights toolbox (Analytics / Combos / Odds). Goals and the Verdict sit
// beside the list in Improve, rendered by DeckView.
export default function DeckTools({
  result, isAnalyzing,
  activePanel, onPanelClick, onRefreshPanel, busy, stalePanels,
  recs, recCat, setRecCat, skipped, onClearSkipped, onAddCard,
  pinned, onTogglePin, changes,
  combos, comp, budgetSwaps,
  dismissedCuts, onClearDismissedCuts,
  declinedUpgrades, onClearDeclinedUpgrades, onLoadDeepChanges,
  upgradeMode, setUpgradeMode,
  onApplyInsightChange, onSkipInsightChange,
  commander, format,
  serverWarmed,
  optimize, optimizing,
  optLog, onUndoChange, onClearLog,
  onGoldfish, section,
}) {
  const improve = section === "improve";

  return (
    <div className="deck-tools">
      {improve && (
        <>
          <div className="improve-head">
            <div>
              <h3 className="improve-h">Suggested changes</h3>
              <p className="improve-sub">Nothing changes in your deck until you apply it.</p>
            </div>
            <div className="improve-head-act">
              {stalePanels?.has("Changes") && <span className="insp-stale-badge">Deck changed</span>}
              {/* Looking again re-runs the AI pass too, if it has been run. */}
              <button type="button" className="ghost" onClick={() => onRefreshPanel("Changes")}
                disabled={busy === "Changes" || Boolean(optimizing)}
                title={optimize ? "Fetches fresh suggestions and runs the AI pass again" : "Fetches fresh suggestions"}>
                Look again
              </button>
            </div>
          </div>

          {!serverWarmed && (
            <div className="sidebar-warming-pill">⚡ Still warming up — first analysis may take a moment</div>
          )}
          {/* Shown here for the AI pass started from a gap; the other loads show their own. */}
          <LoadingIndicator label="Building changes" active={Boolean(optimizing) && busy !== "Changes"} />
          {optimize?.error && !optimizing && (
            <p className="opt-error" role="alert">{optimize.message || "The AI pass failed. Try again."}</p>
          )}
        </>
      )}

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
        changes={changes}
        onAddCard={onAddCard}
        dismissedCuts={dismissedCuts}
        onClearDismissedCuts={onClearDismissedCuts}
        declinedUpgrades={declinedUpgrades}
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

      {improve && <SessionLog log={optLog || []} onUndo={onUndoChange} onClearLog={onClearLog} />}

      <LoadingIndicator label="Analyzing deck" active={isAnalyzing} />
    </div>
  );
}
