import { useEffect, useRef, useState } from "react";
import { loadInsights, saveInsights } from "./insightsCache";
import { stateFromCache, cacheFromState } from "./insightState";

// A deck's insight results and the user's verdicts on its suggestions, with
// their persistence (UX refactor R2; this was a block of DeckView).
//
// Results persist per deck (`mtgweb:insights`) so paid AI panels survive tab
// switches (DeckView unmounts) and reloads. Each panel remembers the deck
// signature it was generated against (`panelSigs`, set through `markFresh`), so
// edits mark it stale instead of silently clearing it.
//
// The hook reloads everything when `deckId` changes. Anything else that has to
// be reset on a deck switch is the caller's own effect, declared after this
// call, so it runs after the reload. `hydratedFor` is the deck the state
// currently belongs to: async work that finishes later compares against it to
// drop a reply for the deck that was switched away from.
export function useInsightCache(deckId) {
  const [initial] = useState(() => stateFromCache(loadInsights(deckId))); // one-time mount snapshot
  const [result, setResult] = useState(initial.result);
  const [recs, setRecs] = useState(initial.recs);
  const [combos, setCombos] = useState(initial.combos);
  const [comp, setComp] = useState(initial.comp);
  const [budgetSwaps, setBudgetSwaps] = useState(initial.budgetSwaps);
  // Card ratings (aiExplain) — persisted like every other paid AI panel so
  // closing the guide, switching tabs, or reloading doesn't discard
  // explanations already paid for with an AI call.
  const [ratings, setRatings] = useState(initial.ratings);
  const [strategy, setStrategy] = useState(initial.strategy);
  const [upgradeMode, setUpgradeMode] = useState(initial.upgradeMode || "budget");
  const [panelSigs, setPanelSigs] = useState(initial.panelSigs);
  const [activePanel, setActivePanel] = useState(initial.activePanel);
  // Per-suggestion user verdicts — persisted with the insight cache and, unlike
  // panel results, never invalidated by deck edits: a skip stays skipped and a
  // pin stays pinned until the user says otherwise (or the card enters the deck).
  const [skipped, setSkipped] = useState(initial.skipped);
  const [pinned, setPinned] = useState(initial.pinned);
  const [dismissedCuts, setDismissedCuts] = useState(initial.dismissedCuts);
  // Declining an upgrade is its own verdict, kept apart from `skipped`: these
  // are cards already IN the deck that the user has decided to keep, not
  // suggestions they passed on. Sharing one Set would make the suggestions'
  // "Show again" silently revive every upgrade the user turned down.
  const [declinedUpgrades, setDeclinedUpgrades] = useState(initial.declinedUpgrades);
  // Which Changes proposals have been applied or skipped, by change id. It
  // persists with the other verdicts so a re-run or a tab switch can't put an
  // applied proposal back on screen: offered again, it is a duplicate card
  // waiting to happen.
  const [insightDecided, setInsightDecided] = useState(initial.insightDecided);

  const markFresh = (k, sig) => setPanelSigs((s) => ({ ...s, [k]: sig }));

  // Switching decks: rehydrate from the incoming deck's cache.
  const hydratedFor = useRef(deckId);
  useEffect(() => {
    const s = stateFromCache(loadInsights(deckId));
    setResult(s.result); // eslint-disable-line react-hooks/set-state-in-effect
    setComp(s.comp); setRecs(s.recs);
    setCombos(s.combos); setBudgetSwaps(s.budgetSwaps); setStrategy(s.strategy);
    setRatings(s.ratings);
    setActivePanel(s.activePanel);
    if (s.upgradeMode) setUpgradeMode(s.upgradeMode);
    setSkipped(s.skipped);
    setPinned(s.pinned);
    setDismissedCuts(s.dismissedCuts);
    setDeclinedUpgrades(s.declinedUpgrades);
    setInsightDecided(s.insightDecided);
    setPanelSigs(s.panelSigs);
    hydratedFor.current = deckId;
  }, [deckId]);

  // Write-through: persist the bundle whenever results, the open panel, or
  // their sigs change. The hydratedFor guard keeps a deck switch from writing
  // the outgoing deck's results under the incoming deck's key during the
  // render where deckId has changed but state hasn't rehydrated.
  useEffect(() => {
    if (hydratedFor.current !== deckId) return;
    saveInsights(deckId, cacheFromState({
      result, comp, recs, combos, budgetSwaps, strategy, ratings, panelSigs,
      activePanel, upgradeMode, pinned, skipped, dismissedCuts, declinedUpgrades, insightDecided,
    }));
  }, [deckId, result, comp, recs, combos, budgetSwaps, strategy, ratings, activePanel, upgradeMode, panelSigs, pinned, skipped, dismissedCuts, declinedUpgrades, insightDecided]);

  function skip(name) {
    setSkipped((prev) => new Set(prev).add(name));
    setPinned((prev) => { if (!prev.has(name)) return prev; const n = new Set(prev); n.delete(name); return n; });
  }
  // Pin ⇄ dismiss are mutually exclusive verdicts on the same suggestion.
  function togglePin(name) {
    setPinned((prev) => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
    setSkipped((prev) => { if (!prev.has(name)) return prev; const n = new Set(prev); n.delete(name); return n; });
  }
  function declineUpgrade(name) { setDeclinedUpgrades((prev) => new Set(prev).add(name)); }
  function clearSkipped() { setSkipped(new Set()); }
  function clearDismissedCuts() { setDismissedCuts(new Set()); }
  function clearDeclinedUpgrades() { setDeclinedUpgrades(new Set()); }

  return {
    result, setResult, comp, setComp, recs, setRecs, combos, setCombos,
    budgetSwaps, setBudgetSwaps, ratings, setRatings, strategy, setStrategy,
    upgradeMode, setUpgradeMode, panelSigs, markFresh, activePanel, setActivePanel,
    skipped, pinned, setPinned, dismissedCuts, declinedUpgrades, insightDecided, setInsightDecided,
    skip, togglePin, declineUpgrade, clearSkipped, clearDismissedCuts, clearDeclinedUpgrades,
    hydratedFor,
  };
}
