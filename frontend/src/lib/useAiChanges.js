import { useEffect, useState } from "react";
import { api, assembleDecklist } from "./api";
import { buildChanges } from "./changeset";
import { loadLog, appendLog, removeLogEntry, clearLog, describeEntry, makeEntry } from "./optimizeLog";

// The AI changes on a deck (UX refactor R3; this was a block of DeckView): the
// one AI pass that proposes cuts, adds and swaps toward the deck's goals, the
// session log of what was applied or skipped, and the single Suggested changes
// list that every source feeds (EDHREC suggestions, the AI pass, budget swaps).
//
// It is wired to its page through its arguments and nothing else:
//   - the deck: `deckId`, `decklist`, `commander`, `format`, `isCommanderFmt`,
//     `currentSig` (the card-presence signature), `apiGoals`;
//   - the page: `notify`, `openSection`, `busy` and `setBusy` (the one busy
//     flag is shared with the Combos panel's load), `recCat` (the EDHREC
//     category shown);
//   - `cache`: what useInsightCache returned for this deck;
//   - `edits`: the page's own `findDeckLine`, `removeCard`, `appendLine`.
// The hook reloads the session log and drops the stale pass when `deckId`
// changes; it is called after useInsightCache so that happens after the cache
// reloads.
export function useAiChanges({
  deckId, decklist, commander, format, isCommanderFmt, currentSig, apiGoals,
  notify, openSection, busy, setBusy, recCat, cache, edits,
}) {
  const {
    recs, setRecs, combos, budgetSwaps, setBudgetSwaps, upgradeMode, setUpgradeMode,
    panelSigs, markFresh, skipped, pinned, setPinned, declinedUpgrades,
    insightDecided, setInsightDecided, skip, declineUpgrade,
  } = cache;
  const { findDeckLine, removeCard, appendLine } = edits;

  const [optimize, setOptimize] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optLog, setOptLog] = useState(() => loadLog(deckId));

  // Switching decks: reload that deck's session log and drop the stale pass.
  useEffect(() => {
    setOptLog(loadLog(deckId)); // eslint-disable-line react-hooks/set-state-in-effect
    setOptimize(null);
  }, [deckId]);

  // Stay in sync with log writes from other surfaces (chat card-chip adds).
  useEffect(() => {
    const onLog = () => setOptLog(loadLog(deckId));
    window.addEventListener("mtgweb:optlog", onLog);
    return () => window.removeEventListener("mtgweb:optlog", onLog);
  }, [deckId]);

  // The AI pass — one call returns a goal-aware changeset; each change is
  // applied/skipped individually and applied ones land in the session log so
  // they can be undone (inverse edit) later.
  async function runOptimize(focus) {
    if (!decklist.trim()) return notify?.("Add some cards first.");
    setOptimizing(true);
    const sig = currentSig; // capture: the deck may be edited mid-flight
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      // Session memory: applied/undone/skipped changes ride along so the AI
      // doesn't re-propose something the user already decided on.
      const recentChanges = loadLog(deckId)
        .slice(-20)
        .map((e) => `${e.action}: ${describeEntry(e)}`);
      const r = await api.optimize(full, format, apiGoals,
        typeof focus === "string" ? focus : null, recentChanges);
      r.changes = (r.changes || []).map((c, i) => ({ ...c, id: `${i}:${c.cut || ""}>${c.add || ""}` }));
      setOptimize(r);
      // The Changes tab's deep pass reuses this result (loadChanges) and needs
      // to know whether it's stale for the deck on screen, same as recs/cuts —
      // not persisted: it resets with the rest of `panelSigs` on every deck
      // switch.
      markFresh("optimize", sig);
    } catch (e) {
      notify?.(`Optimize failed: ${e.message}`);
    } finally {
      setOptimizing(false);
    }
  }

  // A proposal is generated against a snapshot of the deck, so by the time it
  // is applied either half may already be moot: the cut card can be gone, the
  // add card already present. Work out what will really change FIRST, do only
  // that, and log only that — an entry claiming an edit that never happened
  // gives Undo a live button that corrupts the deck.
  function applyOptChange(ch) {
    // The cut card's real line (quantity + any pinned printing), captured
    // before it goes so Undo can put back exactly what was there. Null also
    // means "not in the deck", which is the stale-proposal case.
    const cutLine = ch.cut ? findDeckLine(ch.cut) : null;
    const willCut = Boolean(ch.cut && cutLine);
    // Never append a card the deck already holds — a second "1 Name" line
    // parses as a second copy.
    const willAdd = Boolean(ch.add && !findDeckLine(ch.add));

    if (!willCut && !willAdd) {
      let msg = "Nothing to change — the deck already matches this.";
      if (ch.add && !ch.cut) msg = `${ch.add} is already in the deck.`;
      else if (ch.cut && !ch.add) msg = `${ch.cut} is no longer in the deck.`;
      notify?.(msg);
      return;
    }

    if (willCut) removeCard(ch.cut, { silent: true });
    if (willAdd) appendLine(`1 ${ch.add}`);
    // Half a swap is a cut or an add, and the log (which also feeds the AI's
    // session memory) should say so rather than claim a swap.
    const action = willCut && willAdd ? ch.action : willCut ? "cut" : "add";
    const entry = makeEntry({
      action,
      cut: willCut ? ch.cut : null,
      add: willAdd ? ch.add : null,
      cutLine: willCut ? cutLine : null,
    });
    setOptLog(appendLog(deckId, entry));
    // One-click Undo on the toast, same as every other deck edit here. The
    // session log keeps the entry too, but that lives behind a collapsed
    // accordion — an applied change shouldn't need two clicks to take back.
    notify?.(describeEntry(entry), { label: "Undo", onClick: () => undoOptChange(entry) });
  }

  // A skip goes in the session log too, which feeds the AI's session memory.
  function logOptSkip(ch) {
    const cut = ch.cut || null;
    const add = ch.add || null;
    const dup = optLog.some((e) => e.action === "skip" && e.cut === cut && e.add === add);
    if (!dup) setOptLog(appendLog(deckId, makeEntry({ action: "skip", cut, add })));
  }

  function undoOptChange(entry) {
    if (entry.add) removeCard(entry.add, { silent: true });
    // Restore the line the card actually had, the way removeCard's own undo
    // does. `1 ${cut}` is the fallback for entries logged before cutLine
    // existed and for chat-sourced entries, which never had a line to capture.
    if (entry.cut) appendLine(entry.cutLine || `1 ${entry.cut}`);
    setOptLog(removeLogEntry(deckId, entry.id));
    notify?.(`Undid: ${describeEntry(entry)}`);
  }

  function clearOptLog() {
    setOptLog(clearLog(deckId));
  }

  // Insight tabs whose cached results predate the current card list — shown
  // with a "deck changed" badge and refreshed only by explicit user action.
  const stalePanels = new Set();
  {
    const check = (k, tab, data) => {
      if (data != null && panelSigs[k] && panelSigs[k] !== currentSig) stalePanels.add(tab);
    };
    // The Changes tab is stale if any source feeding it is: recs, the AI
    // changeset (optimize), and — in budget mode — budgetSwaps.
    check("recs", "Changes", recs);
    check("optimize", "Changes", optimize);
    check("combos", "Combos", combos);
    if (upgradeMode === "budget") check("budgetSwaps", "Changes", budgetSwaps);
  }

  // The three sources behind the Changes tab.
  //
  // Opening the tab loads only `recommend`, which is free EDHREC data. Cuts
  // and power upgrades are metered AI calls, so they wait for the pane's
  // explicit "deeper pass" button (`deep`) rather than being spent on anyone
  // who happens to click the tab. Refresh (`force`) re-runs what is already
  // loaded and never buys a source the user hasn't asked for.
  //
  // `mode` is an explicit override for callers that flip the upgrade mode in
  // the same handler (the over-budget chip). A setState in this render does
  // NOT update `upgradeMode` in this closure, so reading the state here would
  // fetch the mode the user was on before the click.
  async function loadChanges({ force = false, mode, deep = false } = {}) {
    if (!decklist.trim()) return notify?.("Add some cards first.");
    openSection("improve");
    // A load already out owns the busy flag. Reopening Improve used to clear
    // it, and with it the loader, and offer the paid pass a second time.
    if (busy === "Changes" && !force) return;
    const wantMode = mode ?? upgradeMode;
    // Refresh means "give me a fresh changeset", so past apply/skip decisions
    // stop hiding proposals. Anything already in the deck comes back marked
    // in_deck by the server, so applied adds still don't reappear.
    if (force) setInsightDecided({});
    const sig = currentSig; // capture: the deck may be edited mid-flight
    const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
    // Cached optimize/budgetSwaps can be non-null but stale: deckId-keyed
    // state persists across the deck being emptied and refilled with an
    // unrelated list (the Job 3 guide reopens exactly there), so "already
    // have it" must mean "have it for THIS decklist", not merely "not null".
    // `force` already re-buys deliberately; a stale cache under `deep` needs
    // the same treatment or it silently serves suggestions for cards that
    // are no longer in the deck.
    const stale = (k) => panelSigs[k] != null && panelSigs[k] !== sig;
    const jobs = [];
    if (force || !recs) {
      jobs.push(api.recommend(full, format).then((r) => {
        setRecs(r);
        markFresh("recs", sig);
        if (r.note) notify?.(r.note);
      }));
    }
    // Metered: bought only when asked for (`deep`), re-bought only when the
    // user refreshes something they already have, or when what's cached no
    // longer matches the deck on screen. This is the same optimize result the
    // AI pass (runOptimize) produces — sourcing the Changes
    // tab's cuts/swaps from it instead of separate ai/cuts + ai/upgrades
    // calls is the whole point of this pass.
    if ((deep && (!optimize || stale("optimize"))) || (force && optimize)) {
      jobs.push(runOptimize());
    }
    if (wantMode === "budget" && ((deep && (!budgetSwaps || stale("budgetSwaps"))) || (force && budgetSwaps))) {
      jobs.push(api.budgetSwaps(full, format).then((r) => { setBudgetSwaps(r); markFresh("budgetSwaps", sig); }));
    }
    // Nothing to fetch: leave busy alone, it may belong to another tool's load.
    if (!jobs.length) return;
    setBusy("Changes");
    const settled = await Promise.allSettled(jobs);
    setBusy("");
    const failed = settled.filter((s) => s.status === "rejected");
    if (failed.length) notify?.(`${failed.length} of ${jobs.length} change sources failed.`);
  }

  // Flipping budget ⇄ power inside Changes pulls in the other source. Routed
  // through loadChanges so the "reuse what's cached" rule lives in one place;
  // recs and cuts are already loaded by the time this can be clicked, so it
  // costs no extra calls. The toggle exists only in Improve's Changes.
  function changeUpgradeMode(mode) {
    setUpgradeMode(mode);
    // Having either deep source already means the deeper pass was asked
    // for, so flipping the toggle is allowed to fetch the other one
    // (budgetSwaps, the only thing still mode-gated).
    loadChanges({ mode, deep: Boolean(budgetSwaps || optimize) });
  }

  // Apply/skip for a Changes proposal. Apply routes through the Optimize
  // queue's own handler so every accepted change lands in the same per-deck
  // session log with undo; skip lands in whichever persisted set that source
  // owns, so a skipped suggestion and a kept cut behave as they always did.
  function applyInsightChange(ch) {
    if (insightDecided[ch.id]) return; // already acted on — never apply twice
    setInsightDecided((d) => ({ ...d, [ch.id]: "applied" }));
    applyOptChange(ch);
    if (ch.source === "rec" && ch.add) {
      setPinned((prev) => { if (!prev.has(ch.add)) return prev; const n = new Set(prev); n.delete(ch.add); return n; });
    }
    // A card you just swapped OUT must not come straight back as a suggested
    // add — that's what `skipped` means, and it's what the old swapCard did.
    // Deliberately not `declinedUpgrades`: you accepted this upgrade, you
    // didn't decline it. Covers budget swaps and optimize-sourced swaps
    // alike — both cut a card out in the same "swap" shape.
    if ((ch.source === "upgrade" || ch.source === "optimize") && ch.cut && ch.add) skip(ch.cut);
  }

  // Each source owns its own persisted verdict list, so one source's "Show
  // again" never revives another's declines.
  function skipInsightChange(ch) {
    if (insightDecided[ch.id]) return; // already applied — can't also skip it
    if (ch.source === "rec") { skip(ch.add); return; }
    // Budget swaps: algorithmic, own verdict set with its own "Show again"
    // control — no `insightDecided` write, same as recs above.
    if (ch.source === "upgrade") { declineUpgrade(ch.cut); return; }
    // Optimize-sourced proposals have no source-owned verdict set, so
    // insightDecided is the only thing that remembers a skip here; the log
    // gets the skip as well, for the AI's session memory.
    setInsightDecided((d) => ({ ...d, [ch.id]: "skipped" }));
    if (ch.source === "optimize") logOptSkip(ch);
  }

  // The Suggested changes list, from every source. Built here so the Improve
  // tab can carry its count. Nothing is counted until a source has loaded.
  const changes = buildChanges({
    recs, recCat, optimize, budgetSwaps, upgradeMode,
    skipped, declinedUpgrades, pinned, decided: insightDecided,
  });
  const changeCount = recs || optimize || budgetSwaps ? changes.length : 0;

  return {
    optimize, optimizing, optLog, runOptimize, undoOptChange, clearOptLog,
    stalePanels, loadChanges, changeUpgradeMode, applyInsightChange, skipInsightChange,
    changes, changeCount,
  };
}
