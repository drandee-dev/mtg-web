import { useEffect, useMemo, useRef, useState } from "react";
import { api, assembleDecklist, disassembleDecklist, getCardImage, FORMATS, warnIfBadAdd } from "../../lib/api";
import CommanderInput from "../CommanderInput";
import CardGrid from "./CardGrid";
import CardTypeahead from "./CardTypeahead";
import DeckTools from "./DeckTools";
import DeckGoalsAssessment from "./DeckGoalsAssessment";
import ImportCardsModal from "./ImportCardsModal";
import MassArtModal from "./MassArtModal";
import UpgradeReview from "./UpgradeReview";
import MoreMenu from "./MoreMenu";
import { PaletteIcon, LinkIcon, LockIcon, UnlockIcon, ListIcon, SearchIcon } from "../Icons";
import { parseDeckText, deckCompleteness, setPrintingInText, splitCommanders, commanderNamesClean, setCommanderPrinting } from "../../lib/deckParser";
import { goalsToApi } from "../../lib/goals";
import { loadLog, appendLog, removeLogEntry, clearLog, describeEntry, makeEntry, isVisibleEntry } from "../../lib/optimizeLog";
import { deckSignature, loadInsights, saveInsights, PANEL_KEYS } from "../../lib/insightsCache";
import { clearBuildNotes } from "../../lib/buildNotes";
import { fmtUsd } from "../../lib/format";
import NavLink from "../layout/NavLink";

// Suggest / Cuts / Upgrades collapsed into one "Changes" tab — a cache written
// before that still names the old tabs, so map it forward on hydrate.
const OLD_CHANGE_PANELS = new Set(["Recommendations", "Cuts", "Upgrades"]);
const migratePanel = (p) => (OLD_CHANGE_PANELS.has(p) ? "Changes" : p);

// The deck's sections, as tabs under its header (UX overhaul job 3.1).
const SECTIONS = [["cards", "Cards"], ["improve", "Improve"], ["stats", "Stats"]];

// Considering-pile text helpers. appendConsidering is written for functional
// setMaybeboard updates (prev => next), so several adds can't lose each other.
const consideringNames = (text) =>
  (text || "").split("\n").map((l) => l.trim().replace(/^\d+\s+/, "").toLowerCase()).filter(Boolean);
function appendConsidering(prev, names) {
  const have = new Set(consideringNames(prev));
  const add = [];
  for (const n of names) {
    if (!have.has(n.toLowerCase())) { have.add(n.toLowerCase()); add.push(`1 ${n}`); }
  }
  return add.length ? `${(prev || "").replace(/\s*$/, "")}\n${add.join("\n")}`.trim() : (prev || "");
}

export default function DeckView({
  decklist, setDecklist, format, setFormat, commander, setCommander,
  maybeboard, setMaybeboard,
  deckName, deckId, onSave, unsaved, onDiscard, onClone, onExport, onPlaytest, onGoldfish, onShare, onRenameDeck,
  arrival, onArrivalDone, onBack, notify, serverWarmed,
  goals, setGoals,
}) {
  // Which section is showing. Screen state only, not in the address: a deck
  // always opens on Cards (Andres, 2026-10-15).
  const [section, setSection] = useState("cards");
  function openSection(id) {
    setSection(id);
    // Opened from below the strip (a toast, the + button): bring the strip
    // back into view so the section starts at its top. Found by id, not a
    // ref: a ref read here trips the compiler lint on `analyze` (immutability).
    document.getElementById("deck-sections")?.scrollIntoView({ block: "nearest" });
  }
  const [textEditOpen, setTextEditOpen] = useState(false);
  // Goals/Assessment collapse state — moved inline out of the rail (Job 6),
  // collapsed by default, persisted the same way Planeswalker's own expand
  // toggle does (mtgweb:pwexpand: "1"/"0" behind a try/catch).
  const [goalsOpen, setGoalsOpen] = useState(
    () => { try { return localStorage.getItem("mtgweb:goalsOpen") === "1"; } catch { return false; } }
  );
  const [assessmentOpen, setAssessmentOpen] = useState(
    () => { try { return localStorage.getItem("mtgweb:assessmentOpen") === "1"; } catch { return false; } }
  );
  function toggleGoalsOpen(next) {
    setGoalsOpen(next);
    try { localStorage.setItem("mtgweb:goalsOpen", next ? "1" : "0"); } catch { /* best-effort */ }
  }
  function toggleAssessmentOpen(next) {
    setAssessmentOpen(next);
    try { localStorage.setItem("mtgweb:assessmentOpen", next ? "1" : "0"); } catch { /* best-effort */ }
  }

  const [importOpen, setImportOpen] = useState(null); // null | "paste" | "url"
  const [massArtOpen, setMassArtOpen] = useState(false);
  // Job 3 guided flow: opens once, right after a pasted decklist replaces an
  // empty deck (see handleImportText) — that's the "I already have a list,
  // upgrade it" case, distinct from pasting more cards into a deck in progress.
  // A deck made from a pasted or imported list on the New deck screen arrives
  // with it open (`arrival.review`), since that paste happened before this
  // page existed.
  const [upgradeReviewOpen, setUpgradeReviewOpen] = useState(Boolean(arrival?.review));
  function closeUpgradeReview() {
    setUpgradeReviewOpen(false);
    onArrivalDone?.();
  }
  const [pendingImport, setPendingImport] = useState(null); // URL import awaiting replace-confirm
  const [titleEdit, setTitleEdit] = useState(null); // null | in-progress rename text

  // Suggested-goals dismissal — per deck, persists.
  const readSuggDismissed = (id) => {
    try { return localStorage.getItem(`mtgweb:goalsugg:${id || "current"}`) === "1"; } catch { return true; }
  };
  const [suggState, setSuggState] = useState(() => ({ deckId, dismissed: readSuggDismissed(deckId) }));
  if (suggState.deckId !== deckId) setSuggState({ deckId, dismissed: readSuggDismissed(deckId) });

  // Insight results persist per-deck (`mtgweb:insights`) so paid AI panels
  // survive tab switches (DeckView unmounts) and reloads. Hydrate initial
  // state from the cache; each panel remembers the deck signature it was
  // generated against so edits mark it stale instead of silently clearing it.
  const [hydrated] = useState(() => loadInsights(deckId)); // one-time mount snapshot
  const hp = (k) => hydrated?.panels?.[k]?.data ?? null;
  const [result, setResult] = useState(() => hp("result"));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recs, setRecs] = useState(() => hp("recs"));
  const [combos, setCombos] = useState(() => hp("combos"));
  const [comp, setComp] = useState(() => hp("comp"));
  const [budgetSwaps, setBudgetSwaps] = useState(() => hp("budgetSwaps"));
  // Job 3 card ratings (aiExplain) — persisted the same way as every other
  // paid AI panel so closing the guide, switching tabs, or reloading doesn't
  // discard explanations already paid for with an AI call.
  const [ratings, setRatings] = useState(() => hp("ratings"));
  const [upgradeMode, setUpgradeMode] = useState(hydrated?.upgradeMode || "budget");
  const [panelSigs, setPanelSigs] = useState(() => {
    const sigs = {};
    for (const k of PANEL_KEYS) {
      const sig = hydrated?.panels?.[k]?.sig;
      if (sig) sigs[k] = sig;
    }
    return sigs;
  });
  const [optimize, setOptimize] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optDecided, setOptDecided] = useState({});
  const [optLog, setOptLog] = useState(() => loadLog(deckId));
  const [strategy, setStrategy] = useState(() => hp("strategy"));
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [cat, setCat] = useState("high_synergy");
  const [activePanel, setActivePanel] = useState(migratePanel(hydrated?.activePanel ?? null));
  const [deckFilter, setDeckFilter] = useState("");
  // Per-suggestion user verdicts — persisted with the insight cache and, unlike
  // panel results, never invalidated by deck edits: a skip stays skipped and a
  // pin stays pinned until the user says otherwise (or the card enters the deck).
  const [skipped, setSkipped] = useState(() => new Set(hydrated?.dismissed || []));
  const [pinned, setPinned] = useState(() => new Set(hydrated?.pinned || []));
  const [dismissedCuts, setDismissedCuts] = useState(() => new Set(hydrated?.dismissedCuts || []));
  // Declining an upgrade is its own verdict, kept apart from `skipped`: these
  // are cards already IN the deck that the user has decided to keep, not
  // suggestions they passed on. Sharing one Set would make the suggestions'
  // "Show again" silently revive every upgrade the user turned down.
  const [declinedUpgrades, setDeclinedUpgrades] = useState(() => new Set(hydrated?.declinedUpgrades || []));
  // Which Changes proposals have been APPLIED, by change id. Deliberately NOT
  // the Optimize queue's `optDecided`: that map is wiped every time the queue
  // re-runs, which would put already-applied suggestions back on screen. It
  // persists with the other verdicts so a tab switch can't resurrect them
  // either — an applied proposal offered again is a duplicate card waiting to
  // happen.
  const [insightDecided, setInsightDecided] = useState(() => hydrated?.insightDecided || {});
  const [cmdrData, setCmdrData] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  const isCommanderFmt = format === "commander" || format === "paupercommander";

  // Card-presence signature of the deck as it stands now — quantity tweaks and
  // art/printing pins don't change it, so they never invalidate cached results.
  const currentSig = useMemo(
    () => deckSignature(decklist, isCommanderFmt ? commander : "", format),
    [decklist, commander, format, isCommanderFmt],
  );
  const markFresh = (k, sig) => setPanelSigs((s) => ({ ...s, [k]: sig }));

  // Switching decks: reload that deck's session log, drop the stale queue,
  // and rehydrate the insight panels from the incoming deck's cache.
  const hydratedFor = useRef(deckId);
  useEffect(() => {
    setOptLog(loadLog(deckId)); // eslint-disable-line react-hooks/set-state-in-effect
    setSection("cards");
    setOptimize(null);
    setOptDecided({});
    const c = loadInsights(deckId);
    const d = (k) => c?.panels?.[k]?.data ?? null;
    setResult(d("result")); setComp(d("comp")); setRecs(d("recs"));
    setCombos(d("combos")); setBudgetSwaps(d("budgetSwaps")); setStrategy(d("strategy"));
    setRatings(d("ratings"));
    setActivePanel(migratePanel(c?.activePanel ?? null));
    if (c?.upgradeMode) setUpgradeMode(c.upgradeMode);
    setSkipped(new Set(c?.dismissed || []));
    setPinned(new Set(c?.pinned || []));
    setDismissedCuts(new Set(c?.dismissedCuts || []));
    setDeclinedUpgrades(new Set(c?.declinedUpgrades || []));
    setInsightDecided(c?.insightDecided || {});
    const sigs = {};
    for (const k of PANEL_KEYS) { const sg = c?.panels?.[k]?.sig; if (sg) sigs[k] = sg; }
    setPanelSigs(sigs);
    hydratedFor.current = deckId;
  }, [deckId]);

  // Write-through: persist the insight bundle whenever results, the open
  // panel, or their sigs change. The hydratedFor guard keeps a deck switch
  // from writing the outgoing deck's results under the incoming deck's key
  // during the render where deckId has changed but state hasn't rehydrated.
  useEffect(() => {
    if (hydratedFor.current !== deckId) return;
    const data = { result, comp, recs, combos, budgetSwaps, strategy, ratings };
    const panels = {};
    for (const k of PANEL_KEYS) {
      if (data[k] != null) panels[k] = { data: data[k], sig: panelSigs[k] || null };
    }
    saveInsights(deckId, {
      panels, activePanel, upgradeMode,
      pinned: [...pinned], dismissed: [...skipped], dismissedCuts: [...dismissedCuts],
      declinedUpgrades: [...declinedUpgrades], insightDecided,
    });
  }, [deckId, result, comp, recs, combos, budgetSwaps, strategy, ratings, activePanel, upgradeMode, panelSigs, pinned, skipped, dismissedCuts, declinedUpgrades, insightDecided]);

  // Stay in sync with log writes from other surfaces (chat card-chip adds).
  useEffect(() => {
    const onLog = () => setOptLog(loadLog(deckId));
    window.addEventListener("mtgweb:optlog", onLog);
    return () => window.removeEventListener("mtgweb:optlog", onLog);
  }, [deckId]);

  // Resolve commander card image (honoring a pinned printing on the primary)
  useEffect(() => {
    if (!commander) { setCmdrData(null); return; }
    const primary = splitCommanders(commander)[0];
    if (!primary) { setCmdrData(null); return; }
    let cancelled = false;
    getCardImage(primary.name, primary.printing).then((d) => { if (!cancelled) setCmdrData(d); });
    return () => { cancelled = true; };
  }, [commander]);

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

  // Auto-analyze on decklist change (debounced)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    const lines = (decklist || "").split("\n").filter((l) => /^\s*\d+\s+\S/.test(l));
    if (lines.length < 5) return;
    debounceRef.current = setTimeout(() => analyze(), 2000);
    return () => clearTimeout(debounceRef.current);
  }, [decklist, commander, format]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playtest-on-complete — the moment the count first hits its target is the
  // moment playtesting becomes meaningful. Fires only on the incomplete →
  // complete transition (not on opening an already-complete deck), once per
  // deck ever (localStorage), with a one-tap Playtest action on the toast.
  const completeRef = useRef({ deckId: undefined, isGood: null });
  useEffect(() => {
    const total = parseDeckText(decklist).totalCards;
    const isGood = deckCompleteness(total, commander, format).status === "good";
    const prev = completeRef.current;
    completeRef.current = { deckId, isGood };
    if (prev.deckId !== deckId || prev.isGood === isGood || !isGood) return;
    const key = `mtgweb:playtestnudge:${deckId || "current"}`;
    try {
      if (localStorage.getItem(key) === "1") return;
      localStorage.setItem(key, "1");
    } catch { return; }
    notify?.("🎉 Deck complete — shuffle up an opening hand?", { label: "▶ Playtest", onClick: onPlaytest });
  }, [decklist, commander, format, deckId, notify, onPlaytest]);

  async function analyze() {
    if (!decklist.trim()) return;
    setIsAnalyzing(true);
    const sig = currentSig; // capture: the deck may be edited mid-flight
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      // Composition is deterministic (no AI) — fetch alongside analysis so the
      // Assessment gap chips are proactive instead of hidden behind a panel click.
      const [res, compRes] = await Promise.all([
        api.analyze(full, format),
        api.composition(full, format).catch(() => null),
      ]);
      setResult(res);
      markFresh("result", sig);
      if (compRes) { setComp(compRes); markFresh("comp", sig); }
    } catch (e) {
      notify?.(`Analyze failed: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Auto-load strategy when deck reaches 20+ cards. Strategy has always been
  // autonomous (no user trigger), so unlike the lazy panels a hydrated-but-
  // stale strategy re-fetches automatically rather than showing a stale badge.
  useEffect(() => {
    const lines = (decklist || "").split("\n").filter((l) => /^\s*\d+\s+\S/.test(l));
    if (lines.length < 20) return;
    if (strategy && (!panelSigs.strategy || panelSigs.strategy === currentSig)) return;
    let cancelled = false;
    setStrategyLoading(true);
    const sig = currentSig;
    const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
    api.aiStrategy?.(full, format, commander)
      .then((r) => { if (!cancelled) { setStrategy(r); markFresh("strategy", sig); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStrategyLoading(false); });
    return () => { cancelled = true; };
  }, [decklist, commander, format]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deck lines may carry a pinned printing suffix: "1 Sol Ring (C21) 263".
  const PRINT_SUFFIX_SRC = "(\\s+\\([A-Za-z0-9]{2,6}\\)\\s+[A-Za-z0-9★†-]{1,10})?";

  // The exact decklist line for a card (with its qty + printing), so an Undo can
  // restore it verbatim instead of a lossy "1 Name".
  function findDeckLine(name) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^\\s*\\d+\\s+${esc}${PRINT_SUFFIX_SRC}\\s*$`, "i");
    return decklist.split("\n").find((l) => re.test(l)) || null;
  }
  function appendLine(line) {
    setDecklist((prev) => `${prev.replace(/\s*$/, "")}\n${line}`);
  }

  // Did adding `name` complete a known near-miss combo? near_misses is only loaded
  // once the Combos panel has been opened; absent it, this is simply a no-op and the
  // add gets the ordinary toast. Returns the payoff text to celebrate, or null.
  function comboUnlockedBy(name) {
    const nm = (combos?.near_misses || []).find((c) => c.missing_card === name);
    if (!nm) return null;
    const payoff = (nm.result || [])
      .map((r) => (typeof r === "string" ? r : r?.name || "")).filter(Boolean).join(", ");
    return payoff || "a new combo";
  }

  function addCard(name, { silent = false } = {}) {
    appendLine(`1 ${name}`);
    const undo = () => removeCard(name, { silent: true });
    if (!silent) warnIfBadAdd({ before: decklist, commander: isCommanderFmt ? commander : "", format, name, notify, undo });
    // A pinned suggestion that lands in the deck has served its purpose.
    setPinned((prev) => { if (!prev.has(name)) return prev; const n = new Set(prev); n.delete(name); return n; });
    if (silent) return;
    const payoff = comboUnlockedBy(name);
    if (payoff) {
      notify?.(`⚡ Combo unlocked! ${name} → ${payoff}`, { label: "View", onClick: () => { setActivePanel("Combos"); openSection("stats"); } });
    } else {
      notify?.(`Added ${name}`, { label: "Undo", onClick: undo });
    }
  }

  function removeCard(name, { silent = false } = {}) {
    const removedLine = findDeckLine(name);
    setDecklist((prev) => {
      const lines = prev.split("\n");
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const idx = lines.findIndex((l) => new RegExp(`^\\s*\\d+\\s+${esc}${PRINT_SUFFIX_SRC}\\s*$`, "i").test(l));
      if (idx >= 0) lines.splice(idx, 1);
      return lines.join("\n");
    });
    if (!silent) {
      notify?.(`Removed ${name}`, removedLine
        ? { label: "Undo", onClick: () => appendLine(removedLine) }
        : undefined);
    }
  }

  // Promote a card in the 99 to the command zone (from card inspection). Pulls it
  // out of the decklist and demotes the current commander(s), if any, back into
  // the 99 so nothing is lost. Printing suffixes on the old commander are dropped.
  function makeCommander(name) {
    removeCard(name, { silent: true });
    const demoted = commanderNamesClean(commander);
    if (demoted.length) {
      setDecklist((prev) => `${prev.replace(/\s*$/, "")}\n${demoted.map((d) => `1 ${d}`).join("\n")}`);
    }
    setCommander(name);
    notify?.(demoted.length
      ? `${name} is now your commander — ${demoted.join(", ")} moved to the 99`
      : `${name} is now your commander`);
  }

  // Set a card's copy count, normalizing it to a single `N Name` line (collapses any
  // duplicate lines parseDeckText would have summed). qty <= 0 removes the card.
  function setCardQty(name, qty) {
    setDecklist((prev) => {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^\\s*\\d+\\s+${esc}${PRINT_SUFFIX_SRC}\\s*$`, "i");
      const out = [];
      let placed = false;
      for (const l of prev.split("\n")) {
        const m = l.match(re);
        if (m) {
          // Preserve any pinned printing suffix through qty changes
          if (!placed && qty > 0) { out.push(`${qty} ${name}${m[1] || ""}`); placed = true; }
        } else {
          out.push(l);
        }
      }
      if (!placed && qty > 0) out.push(`${qty} ${name}`);
      return out.join("\n");
    });
  }

  // Pin (or clear) a specific printing for a card — persists in the decklist
  // text as "N Name (SET) 123", Moxfield-style, so it travels with saves,
  // shares, and exports.
  function setCardPrinting(name, printing) {
    setDecklist((prev) => setPrintingInText(prev, name, printing));
    notify?.(printing ? `${name} → ${printing.set} #${printing.cn}` : `${name} reset to default printing`);
  }

  // Commander printings live in the commander string (not the decklist text),
  // suffix-encoded so they travel with saves/shares — backend strips them.
  function setCommanderPrintingFor(name, printing) {
    setCommander(setCommanderPrinting(commander, name, printing));
    notify?.(printing ? `${name} → ${printing.set} #${printing.cn}` : `${name} reset to default printing`);
  }

  // Moving a card to Considering also pulls it out of the deck (silent remove so
  // there's a single, subtle toast rather than two).
  function addToConsidering(name) {
    setMaybeboard?.((prev) => appendConsidering(prev, [name]));
    removeCard(name, { silent: true });
    notify?.(`Moved ${name} to Considering`);
  }

  function removeFromConsidering(name) {
    setMaybeboard?.((prev) =>
      (prev || "")
        .split("\n")
        .filter((l) => {
          const m = l.trim().match(/^(\d+)\s+(.+)$/);
          return !(m && m[2].trim().toLowerCase() === name.toLowerCase());
        })
        .join("\n")
        .trim()
    );
  }

  // Considering column → maindeck: one action, one toast.
  function moveFromConsidering(name) {
    removeFromConsidering(name);
    setDecklist((prev) => `${prev.replace(/\s*$/, "")}\n1 ${name}`);
    notify?.(`Added ${name} to the deck`);
    // Undo puts it back where it came from.
    warnIfBadAdd({ before: decklist, commander: isCommanderFmt ? commander : "", format, name, notify, undo: () => addToConsidering(name) });
  }

  function renameDeck() {
    const name = prompt("Deck name:", deckName || "Untitled deck");
    if (name != null && name.trim() && name.trim() !== deckName) onRenameDeck?.(name.trim());
  }

  async function handleSave() {
    setSaveState("saving");
    try { await onSave(); setSaveState("saved"); setTimeout(() => setSaveState("idle"), 2000); }
    catch { setSaveState("idle"); }
  }

  // Toggle the search/paste panel and focus its input (Frame G "Card search").
  function toggleSearch() {
    setSearchOpen((o) => {
      const next = !o;
      if (next) setTimeout(() => searchRef.current?.querySelector("input")?.focus(), 60);
      return next;
    });
  }

  // Ask the Planeswalker for 12 cards, validate them server-side (exact name,
  // legal, on-color, not already in), keep the first 8 that pass, and add them
  // in ONE state update. Never touches the deck itself.
  async function suggestConsiderations() {
    setSuggesting(true);
    try {
      const full = assembleDecklist(decklist || "", commander || "");
      const prompt = "Suggest 12 specific cards I should CONSIDER adding to this deck. " +
        "Reply with one card per line in the exact format: `1 Card Name — short reason`. " +
        "Only real Magic cards legal in this deck's colors. No preamble.";
      const r = await api.planeswalkerChat([{ role: "user", content: prompt }], full, format, commander);
      const text = r?.response || "";
      // The dash must be space-separated, or "Snow-Covered Forest" parses as "Snow".
      const names = [...new Set(text.split("\n")
        .map((l) => l.trim().match(/^\d+\s+(.+?)(?:\s+[—–-]\s+.*)?$/)?.[1].trim())
        .filter((n) => n && n.length <= 100))].slice(0, 40);
      if (!names.length) { notify?.("No suggestions parsed — try again."); return; }
      const v = await api.validateCards(full, format, names);
      const ok = [];
      const skipped = {};
      for (const x of v?.results || []) {
        if (x.status !== "ok") skipped[x.status] = (skipped[x.status] || 0) + 1;
        else if (ok.length < 8 && !ok.some((n) => n.toLowerCase() === x.name.toLowerCase())) ok.push(x.name);
      }
      const pile = new Set(consideringNames(maybeboard));
      const fresh = ok.filter((n) => !pile.has(n.toLowerCase())).length;
      if (ok.length) setMaybeboard?.((prev) => appendConsidering(prev, ok));
      const labels = { off_color: "off-color", illegal: "not legal", unknown: "unknown", in_deck: "in deck" };
      const m = Object.values(skipped).reduce((a, b) => a + b, 0);
      let msg = `Added ${fresh} to Considering`;
      if (m) msg += ` (${m} skipped: ${Object.entries(skipped).map(([k, n]) => `${n} ${labels[k] || k}`).join(", ")})`;
      if (isCommanderFmt && v?.identity_source !== "commander") msg += ". Set your commander for accurate suggestions.";
      notify?.(msg);
    } catch (e) {
      notify?.(`Suggestion failed: ${e.message}`);
    } finally {
      setSuggesting(false);
    }
  }

  async function loadPanel(kind, fn, setter, stateKey) {
    if (!decklist.trim()) return notify?.("Add some cards first.");
    setBusy(kind);
    setActivePanel(kind);
    const sig = currentSig; // capture: the deck may be edited mid-flight
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      const r = await fn(full, format);
      setter(r);
      if (stateKey) markFresh(stateKey, sig);
      if (r.note) notify?.(r.note);
    } catch (e) {
      notify?.(`${kind} failed: ${e.message}`);
    } finally {
      setBusy("");
    }
  }

  // Fold imported decklist text into the current deck. Empty deck → replace
  // (adopting the imported commander/maybeboard); populated deck → append,
  // adopting the imported commander only if none is set yet.
  function mergeImportedText(text) {
    const { commander: impCmdr, deckText: impMain, maybeboard: impMaybe } = disassembleDecklist(text || "");
    const mainLines = (impMain || "").trim();
    if (!mainLines && !impCmdr) throw new Error("no cards found in the import");
    const wasEmpty = !decklist.trim() && !commander;
    if (wasEmpty) {
      // Wholesale replacement — whatever the generator explained is gone.
      clearBuildNotes();
      setDecklist(mainLines);
      if (impCmdr) setCommander(impCmdr);
      if (impMaybe) setMaybeboard(impMaybe);
    } else {
      if (mainLines) setDecklist((prev) => (prev.trim() ? `${prev.replace(/\s*$/, "")}\n${mainLines}` : mainLines));
      if (impCmdr && !commander) setCommander(impCmdr);
    }
    const n = parseDeckText(mainLines).totalCards;
    notify?.(wasEmpty ? `Imported ${n} cards.` : `Added ${n} cards to the deck.`);
    return wasEmpty;
  }

  async function handleImportText(text) {
    try {
      const wasEmpty = mergeImportedText(text);
      // A paste into an empty deck is "I have a list, help me upgrade it" —
      // guide the user through goals → bracket/ratings → swaps. Adding cards
      // to a deck already in progress skips the guide.
      if (wasEmpty) setUpgradeReviewOpen(true);
    } catch (e) {
      notify?.(`Import failed: ${e.message}`);
      throw e;
    }
  }

  // URL imports REPLACE the deck (a linked deck is a complete deck, not a card
  // pack). Empty deck → apply immediately; populated deck → confirm first.
  function applyUrlImport(res) {
    const { commander: impCmdr, deckText: impMain, maybeboard: impMaybe } = disassembleDecklist(res.decklist || "");
    // A URL import is a whole different deck, so the generator's notes go too.
    clearBuildNotes();
    setDecklist((impMain || "").trim());
    setCommander(impCmdr || "");
    // Sideboard/maybeboard from the source land in Considering — never maindeck.
    const side = [res.sideboard, impMaybe].filter(Boolean).join("\n").trim();
    setMaybeboard?.(side);
    if (res.format) setFormat(res.format);
    if (res.name) onRenameDeck?.(res.name);
    const n = parseDeckText(impMain || "").totalCards;
    notify?.(`Imported "${res.name || "deck"}" — ${n} cards${side ? ` (+${parseDeckText(side).totalCards} in Considering)` : ""}.`);
  }

  async function handleImportUrl(url) {
    try {
      const res = await api.importUrl((url || "").trim());
      if (!(res.decklist || "").trim() && !(res.sideboard || "").trim()) throw new Error("no cards found in the import");
      const deckPopulated = Boolean(decklist.trim() || commander);
      if (deckPopulated) {
        setPendingImport(res); // confirm before replacing
      } else {
        applyUrlImport(res);
        // Same "I have a list, help me upgrade it" state a paste into an
        // empty deck lands in — the guide shouldn't care which import path
        // got the user there.
        setUpgradeReviewOpen(true);
      }
    } catch (e) {
      notify?.(`Import failed: ${e.message}`);
      throw e;
    }
  }

  const hasCommander = isCommanderFmt && commander;
  // A pasted list's first line is usually its commander. Offer it, never move
  // it silently. Only from a result for the current list, and only when that
  // exact line exists to move (an unnumbered line would be left behind).
  const cmdrCandidate = result?.commander_candidate;
  const commanderOffer = isCommanderFmt && !commander && !locked && cmdrCandidate
    && panelSigs.result === currentSig && findDeckLine(cmdrCandidate) && (
    <p className="cmdr-suggest muted small">
      No commander set yet.{" "}
      <button className="primary small" onClick={() => makeCommander(cmdrCandidate)}>
        Make {cmdrCandidate} your commander
      </button>
    </p>
  );
  const parsedDeck = parseDeckText(decklist);
  const totalCards = parsedDeck.totalCards;
  const deckEmpty = !decklist.trim() && !commander;
  const completeness = deckCompleteness(totalCards, commander, format);
  const apiGoals = goalsToApi(goals);
  const deckCardNames = parsedDeck.cards.map((c) => c.name);

  // Mass art change — commander + maindeck + Considering (maybeboard) all
  // participate, since a pinned printing is meaningful in every board.
  const deckCommanders = splitCommanders(commander);
  const consideringCards = parseDeckText(maybeboard || "").cards;
  const massArtNames = [
    ...deckCommanders.map((c) => c.name),
    ...deckCardNames,
    ...consideringCards.map((c) => c.name),
  ];
  const artPinCount =
    parsedDeck.cards.filter((c) => c.printing).length +
    consideringCards.filter((c) => c.printing).length +
    deckCommanders.filter((c) => c.printing).length;

  function applyMassArt(matches) {
    let text = decklist;
    let side = maybeboard || "";
    let cmdr = commander;
    let n = 0;
    for (const m of matches) {
      const printing = { set: m.set, cn: m.cn };
      let hit = false;
      const cm = deckCommanders.find((c) => c.name.toLowerCase() === m.name.toLowerCase());
      if (cm) {
        cmdr = setCommanderPrinting(cmdr, cm.name, printing);
        hit = true;
      }
      // A name can live in both maindeck and Considering — pin it in each.
      const nextMain = setPrintingInText(text, m.name, printing);
      if (nextMain !== text) { text = nextMain; hit = true; }
      const nextSide = setPrintingInText(side, m.name, printing);
      if (nextSide !== side) { side = nextSide; hit = true; }
      if (hit) n++;
    }
    if (text !== decklist) setDecklist(text);
    if (side !== (maybeboard || "")) setMaybeboard?.(side);
    if (cmdr !== commander) setCommander(cmdr);
    notify(`🎨 Changed art on ${n} card${n === 1 ? "" : "s"}`);
  }

  function clearAllArtPins() {
    let text = decklist;
    for (const c of parsedDeck.cards) {
      if (c.printing) text = setPrintingInText(text, c.name, null);
    }
    let side = maybeboard || "";
    for (const c of consideringCards) {
      if (c.printing) side = setPrintingInText(side, c.name, null);
    }
    let cmdr = commander;
    for (const c of deckCommanders) {
      if (c.printing) cmdr = setCommanderPrinting(cmdr, c.name, null);
    }
    if (text !== decklist) setDecklist(text);
    if (side !== (maybeboard || "")) setMaybeboard?.(side);
    if (cmdr !== commander) setCommander(cmdr);
    notify("Art reset to default printings");
  }

  // Suggested goals — cold-start nudge. Once analysis knows the deck's reality
  // (detected bracket, total price), offer it as a starting goal set. User
  // confirms via the banner; never silently applied. Dismissal persists per deck.
  const detectedBracket = result?.bracket?.bracket ?? null;
  const deckPrice = result?.breakdown?.price_usd ?? null;
  const goalSuggestion =
    !apiGoals && !suggState.dismissed && (detectedBracket != null || deckPrice != null)
      ? {
          bracketTarget: detectedBracket,
          // Headroom above today's price, rounded to a clean $25 step, so the
          // ceiling doesn't start out already violated.
          budgetCeiling: deckPrice != null ? Math.max(25, Math.ceil((deckPrice * 1.15) / 25) * 25) : null,
        }
      : null;

  function dismissGoalSuggestion() {
    try { localStorage.setItem(`mtgweb:goalsugg:${deckId || "current"}`, "1"); } catch { /* best-effort */ }
    setSuggState({ deckId, dismissed: true });
  }

  function acceptGoalSuggestion() {
    setGoals({
      ...goals,
      ...(goalSuggestion.bracketTarget != null ? { bracketTarget: goalSuggestion.bracketTarget } : {}),
      ...(goalSuggestion.budgetCeiling != null ? { budgetCeiling: goalSuggestion.budgetCeiling } : {}),
    });
    dismissGoalSuggestion();
    notify?.("Goals set — the AI now optimizes toward them.");
  }

  // Optimize queue — one AI pass returns a goal-aware changeset; each change is
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
      setOptDecided({});
      // The Changes tab's deep pass reuses this result (loadChanges) and needs
      // to know whether it's stale for the deck on screen, same as recs/cuts —
      // not persisted (see optDecided's comment above): it resets with the
      // rest of `panelSigs` on every deck switch.
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
      setOptDecided((d) => ({ ...d, [ch.id]: "applied" }));
      let msg = "Nothing to change — the deck already matches this.";
      if (ch.add && !ch.cut) msg = `${ch.add} is already in the deck.`;
      else if (ch.cut && !ch.add) msg = `${ch.cut} is no longer in the deck.`;
      notify?.(msg);
      return;
    }

    if (willCut) removeCard(ch.cut, { silent: true });
    if (willAdd) appendLine(`1 ${ch.add}`);
    setOptDecided((d) => ({ ...d, [ch.id]: "applied" }));
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

  function skipOptChange(ch) {
    setOptDecided((d) => ({ ...d, [ch.id]: "skipped" }));
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
  // (Plain computation, not a hook: this sits below conditional returns.)
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
    // sidebar Optimize widget produces (runOptimize) — sourcing the Changes
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

  // Job 3 guided flow — ratings and the hand-off into the existing Changes
  // queue. Kept next to applyInsightChange/skipInsightChange since it feeds
  // the same state (Improve, the Changes deep-load).
  //
  // Ratings persist into the same panel cache every other paid AI result
  // uses (PANEL_KEYS/insightsCache) — a spent AI call is kept on a close, a
  // tab switch, or a reload, same as cuts/upgrades/strategy. Only a
  // successful call is cached; a failure leaves whatever was cached before.
  function loadCardRatings(cardNames) {
    if (!decklist.trim()) return Promise.resolve({ error: true, message: "Add some cards first." });
    const sig = currentSig; // capture: the deck may be edited mid-flight
    const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
    return api.aiExplain(full, format, cardNames, null, apiGoals).then((r) => {
      if (!r.error) { setRatings(r); markFresh("ratings", sig); }
      return r;
    });
  }

  function goToChangesFromReview() {
    closeUpgradeReview();
    loadChanges({ deep: true }); // opens Improve itself
  }

  // Each source owns its own persisted verdict list, so one source's "Show
  // again" never revives another's declines.
  function skipInsightChange(ch) {
    if (insightDecided[ch.id]) return; // already applied — can't also skip it
    if (ch.source === "rec") { skip(ch.add); return; }
    // Budget swaps: algorithmic, own verdict set with its own "Show again"
    // control — no `insightDecided` write, same as recs above.
    if (ch.source === "upgrade") { declineUpgrade(ch.cut); return; }
    // Optimize-sourced proposals have no source-owned verdict set (optDecided
    // is wiped on every runOptimize call — see its declaration comment), so
    // insightDecided is the only thing that remembers a skip here.
    setInsightDecided((d) => ({ ...d, [ch.id]: "skipped" }));
  }

  // One props object for Improve and Stats (Goals, Assessment and both
  // DeckTools renders) — keep wiring in one place.
  const toolProps = {
    result,
    isAnalyzing,
    activePanel,
    busy,
    // The Stats strip. Changes is not on it: it loads when Improve opens.
    onPanelClick: (id) => {
      if (activePanel === id) { setActivePanel(null); return; }
      if (id === "DrawOdds") { setActivePanel("DrawOdds"); return; }
      // Tab switches reuse loaded data; the pane's Refresh reloads.
      if (id === "Combos") {
        if (combos) { setActivePanel("Combos"); return; }
        loadPanel("Combos", api.combos, setCombos, "combos");
      }
    },
    onRefreshPanel: (id) => {
      if (id === "Changes") { loadChanges({ force: true }); return; }
      if (id === "Combos") loadPanel("Combos", api.combos, setCombos, "combos");
    },
    stalePanels,
    recs,
    recCat: cat,
    setRecCat: setCat,
    skipped,
    onClearSkipped: clearSkipped,
    pinned,
    onTogglePin: togglePin,
    dismissedCuts,
    onClearDismissedCuts: clearDismissedCuts,
    declinedUpgrades,
    onClearDeclinedUpgrades: clearDeclinedUpgrades,
    insightDecided,
    onLoadDeepChanges: () => loadChanges({ deep: true }),
    onAddCard: addCard,
    combos,
    comp,
    budgetSwaps,
    upgradeMode,
    setUpgradeMode: changeUpgradeMode,
    onApplyInsightChange: applyInsightChange,
    onSkipInsightChange: skipInsightChange,
    commander,
    format,
    strategy,
    strategyLoading,
    serverWarmed,
    goals,
    setGoals,
    deckCardNames,
    goalSuggestion,
    onAcceptGoalSuggestion: acceptGoalSuggestion,
    onDismissGoalSuggestion: dismissGoalSuggestion,
    goalsOpen,
    onToggleGoals: toggleGoalsOpen,
    assessmentOpen,
    onToggleAssessment: toggleAssessmentOpen,
    optimize,
    optimizing,
    onRunOptimize: runOptimize,
    optGapCount: comp?.categories?.filter((c) => c.status === "thin").length || 0,
    optDecided,
    onApplyChange: applyOptChange,
    onSkipChange: skipOptChange,
    optLog: optLog.filter(isVisibleEntry),
    onUndoChange: undoOptChange,
    onClearLog: clearOptLog,
    onGapChip: runOptimize,
    // "Goldfish this line" from a combo card → open Playtest with the pieces staged.
    onGoldfish,
    // Over-budget chip → the Changes queue, pre-set to budget swaps. The mode
    // is passed explicitly: setUpgradeMode won't have landed by the time
    // loadChanges reads it out of this render's closure.
    onOverBudget: () => {
      setUpgradeMode("budget");
      // Tapping "you're over budget" IS the request for swaps, so it opts into
      // the deeper pass rather than landing on an empty queue.
      loadChanges({ mode: "budget", deep: true });
    },
  };

  // A saved deck with edits not yet saved: marked beside Save in both headers,
  // and the edits can be dropped from either menu (App keeps them as a draft).
  // The badge is only the mark; the announcement is the live region in the
  // render, which is always there so a screen reader hears the change.
  const unsavedBadge = unsaved && (
    <span className="badge warn deck-unsaved" title="Changes not saved yet. They are kept in this browser until you save or discard them.">
      Unsaved
    </span>
  );
  // The text editor is in Cards, so asking for it from another section goes there.
  function toggleTextEdit() {
    if (!textEditOpen) openSection("cards");
    setTextEditOpen((o) => !o);
  }
  // One More menu for both bars; the phone's also holds Playtest, which has
  // its own button on the desktop header.
  const moreItems = [
    ...(locked ? [] : [{ label: "Import cards", icon: "⤓", onClick: () => setImportOpen("paste") }]),
    ...(!locked && onRenameDeck ? [{ label: "Rename deck", icon: "✎", onClick: renameDeck }] : []),
    ...(locked ? [] : [{ label: "Mass change art", icon: <PaletteIcon />, onClick: () => setMassArtOpen(true) }]),
    { label: "Share link", icon: <LinkIcon />, onClick: onShare },
    { label: "Clone deck", icon: "⎘", onClick: onClone },
    { label: "Export .txt", icon: "↓", onClick: onExport },
    ...(locked ? [] : [{ label: textEditOpen ? "Hide text editor" : "Edit as text", icon: "✎", onClick: toggleTextEdit }]),
    { label: locked ? "Unlock deck" : "Lock deck (view only)", icon: locked ? <UnlockIcon /> : <LockIcon />, onClick: () => setLocked((l) => !l) },
    ...(unsaved && !locked ? [{ label: "Discard changes", icon: "↺", danger: true, onClick: onDiscard }] : []),
  ];
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save";
  const legality = result?.legality?.overall_status;
  const art = hasCommander ? cmdrData?.art_crop : null;

  return (
    <div>
      <span className="visually-hidden deck-unsaved-live" role="status">
        {unsaved ? "Unsaved changes. They are kept in this browser until you save or discard them." : ""}
      </span>
      {/* Phone top bar: back to Decks, then Save and More. The name and
          facts are in the header below it (job 3.2). */}
      <div className="mobile-deck-nav">
        <button className="mobile-deck-back" onClick={onBack}>&#8249; Decks</button>
        <div className="mobile-deck-actions">
          {unsavedBadge}
          <button
            className={`primary small mobile-deck-save${saveState === "saved" ? " btn-saved" : ""}`}
            disabled={saveState === "saving"}
            onClick={handleSave}
          >
            {saveLabel}
          </button>
          <MoreMenu items={[{ label: "Playtest", icon: "▶", onClick: onPlaytest }, ...moreItems]} />
        </div>
      </div>

      {/* The deck header (job 3.2): the commander's art as a slim strip under
          a dark wash in either theme, "Decks / name", one line of facts with
          each fact once, then Playtest, Save, More. The crumb and the actions
          are the phone top bar's job under 700px. */}
      <header className={`deck-head${art ? "" : " deck-head-plain"}`}>
        {art && <img className="deck-head-art" src={art} alt="" />}
        <div className="deck-head-body">
          <div className="deck-head-main">
            <div className="deck-head-title">
              <NavLink href="/" onNavigate={onBack} className="deck-head-crumb">Decks</NavLink>
              <span className="deck-head-sep" aria-hidden="true">/</span>
              {titleEdit == null ? (
                <h1 className="deck-title" onDoubleClick={locked ? undefined : () => setTitleEdit(deckName || "Untitled deck")}>
                  {deckName || "Untitled deck"}
                  {!locked && onRenameDeck && (
                    <button className="dh-rename" aria-label="Rename deck" title="Rename deck"
                      onClick={() => setTitleEdit(deckName || "Untitled deck")}>✎</button>
                  )}
                </h1>
              ) : (
                <input
                  className="dh-title-input"
                  autoFocus
                  value={titleEdit}
                  onChange={(e) => setTitleEdit(e.target.value.slice(0, 80))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setTitleEdit(null);
                  }}
                  onBlur={() => {
                    const v = (titleEdit || "").trim();
                    setTitleEdit(null);
                    if (v && v !== deckName) onRenameDeck?.(v);
                  }}
                  aria-label="Deck name"
                />
              )}
            </div>
            <div className="deck-head-facts">
              <select
                className="dh-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                disabled={locked}
                aria-label="Deck format"
              >
                {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              {/* Counted here as you edit; the analysis catches up later. */}
              <span className={`deck-head-count is-${completeness.status}`} title={completeness.title}>
                {completeness.label} cards
              </span>
              {result?.bracket?.bracket != null && (
                <span title="Estimated bracket">Bracket {result.bracket.bracket}</span>
              )}
              {result?.breakdown?.price_usd != null && (
                <span title="Estimated deck price">${Math.round(result.breakdown.price_usd)}</span>
              )}
              {result?.stats?.avg_cmc != null && (
                <span className="deck-head-avg">Average cost {result.stats.avg_cmc}</span>
              )}
              {legality === "PASS" && <span className="deck-head-legal">Legal</span>}
              {legality === "FAIL" && <span className="deck-head-illegal" title="See Legality issues in Stats">Not legal</span>}
              {locked && <span className="deck-head-locked" title="Deck is locked (view only)">Locked</span>}
            </div>
          </div>
          <div className="deck-head-actions dh-actions">
            <button className="deck-head-ghost" onClick={onPlaytest}>Playtest</button>
            {unsavedBadge}
            <button
              className={`primary deck-head-save${saveState === "saved" ? " btn-saved" : ""}`}
              disabled={saveState === "saving"}
              onClick={handleSave}
            >
              {saveLabel}
            </button>
            <MoreMenu items={moreItems} />
          </div>
        </div>
      </header>

      {/* Commander picker, for a commander deck that has none yet. */}
      {isCommanderFmt && !commander && (
        <div className="cmdr-input-row">
          <CommanderInput commander={commander} setCommander={setCommander} />
          {commanderOffer}
        </div>
      )}

      {/* The deck's sections as tabs (job 3.1). Every panel stays mounted and
          the others are hidden, so the card grid keeps its state and images
          across a switch. The commander renders as a crowned leading column
          inside the grid (CardGrid), not a side panel. */}
      <div>
        <div className="deck-sections" id="deck-sections" role="tablist" aria-label="Deck sections">
          {SECTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`deck-tab-${id}`}
              aria-controls={`deck-panel-${id}`}
              aria-selected={section === id}
              className="deck-section-tab"
              // Opening Improve loads its Changes: free EDHREC suggestions,
              // reused once loaded. The paid passes wait for their own buttons.
              onClick={() => (id === "improve" && decklist.trim() ? loadChanges() : openSection(id))}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="deck-panel-cards" aria-labelledby="deck-tab-cards" hidden={section !== "cards"}>
          {/* A collection build's buy list. It comes with the deck from the New
              deck screen and shows until dismissed; it is not saved. */}
          {arrival?.buy && (
            <div className="panel" role="region" aria-label="What to buy">
              <div className="spread">
                <h3 className="gen-cat">
                  {arrival.buy.owned} of {arrival.buy.picks} picks already in your collection
                </h3>
                <button className="ghost small" onClick={onArrivalDone}>Dismiss</button>
              </div>
              {arrival.buy.list.length === 0 ? (
                <p className="muted small">Nothing left to buy — the whole deck came from your collection.</p>
              ) : (
                <>
                  <p className="gen-lede" style={{ marginBottom: ".6rem" }}>
                    {arrival.buy.list.length} card{arrival.buy.list.length === 1 ? "" : "s"} to buy
                    {arrival.buy.total > 0 ? `, about ${fmtUsd(arrival.buy.total)} total` : ""}.
                  </p>
                  {arrival.buy.list.map((c) => (
                    <div key={c.name} className="gen-card-row">
                      <span className="gen-card-name">
                        {c.name}{" "}
                        <span className="badge warn small">
                          {c.price_usd != null ? `Buy · ${fmtUsd(c.price_usd)}` : "Buy · price unknown"}
                        </span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {/* Predictive card search — opened by the toolbar "Card search" button,
              the mobile + FAB, and the empty-deck action. */}
          {searchOpen && !locked && (
            <div className="deck-search-panel" ref={searchRef}>
              <CardTypeahead addCard={addCard} notify={notify} autoFocus placeholder="Search cards to add…" />
            </div>
          )}
          {/* Raw decklist editor — "Edit as text" in the deck ⋯ menu */}
          {textEditOpen && !locked && (
            <textarea
              className="deck-text-editor"
              value={decklist}
              onChange={(e) => setDecklist(e.target.value)}
              placeholder={"1 Sol Ring\n1 Llanowar Elves\n…"}
              aria-label="Edit decklist as text"
            />
          )}
          {deckEmpty && !searchOpen ? (
            <div className="empty-deck">
              <div className="empty-deck-inner">
                {/* The ways to start a deck are on the New deck screen. This deck
                    exists already: these two add cards to it. */}
                <h3>Your deck is empty</h3>
                <p className="muted">Add cards one at a time, or bring in a list.</p>
                <div className="empty-actions">
                  <button className="empty-action" onClick={toggleSearch}>
                    <span className="empty-action-ico"><SearchIcon size={18} /></span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Search for cards</span>
                      <span className="empty-action-d">Add card by card, with search as you type</span>
                    </span>
                  </button>
                  <button className="empty-action" onClick={() => setImportOpen("paste")}>
                    <span className="empty-action-ico"><ListIcon size={18} /></span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Import cards</span>
                      <span className="empty-action-d">Paste a list, or a Moxfield or Archidekt link</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <CardGrid
              decklist={decklist}
              commander={commander}
              format={format}
              deckId={deckId}
              filter={deckFilter}
              setFilter={setDeckFilter}
              onRemove={locked ? null : removeCard}
              onConsider={locked ? null : addToConsidering}
              addCard={locked ? null : addCard}
              onCardSearch={locked ? null : toggleSearch}
              notify={notify}
              onChangeCommander={locked ? null : () => setCommander("")}
              onMakeCommander={locked || !isCommanderFmt ? null : makeCommander}
              setCardQty={locked ? null : setCardQty}
              onSetPrinting={locked ? null : setCardPrinting}
              onSetCommanderPrinting={locked ? null : setCommanderPrintingFor}
              maybeboard={maybeboard}
              onMoveFromConsidering={locked ? null : moveFromConsidering}
              onRemoveConsidering={locked ? null : removeFromConsidering}
              onSuggestConsiderations={locked ? null : suggestConsiderations}
              suggesting={suggesting}
            />
          )}
        </div>

        {/* Improve: what to change. Goals are the settings, the Assessment the
            verdict, then the Optimize queue and Changes. */}
        <div role="tabpanel" id="deck-panel-improve" aria-labelledby="deck-tab-improve"
          className="deck-section-panel" hidden={section !== "improve"}>
          {!deckEmpty && <DeckGoalsAssessment {...toolProps} />}
          <DeckTools {...toolProps} section="improve" />
        </div>

        {/* Stats: reference, no AI. */}
        <div role="tabpanel" id="deck-panel-stats" aria-labelledby="deck-tab-stats"
          className="deck-section-panel" hidden={section !== "stats"}>
          <DeckTools {...toolProps} section="stats" />
        </div>
      </div>

      <ImportCardsModal
        open={importOpen}
        onClose={() => setImportOpen(null)}
        onImportText={handleImportText}
        onImportUrl={handleImportUrl}
      />

      <UpgradeReview
        open={upgradeReviewOpen}
        onClose={closeUpgradeReview}
        goals={goals}
        setGoals={setGoals}
        deckCardNames={deckCardNames}
        result={result}
        commanderOffer={commanderOffer}
        ratings={ratings}
        ratingsStale={Boolean(ratings && panelSigs.ratings && panelSigs.ratings !== currentSig)}
        onLoadRatings={loadCardRatings}
        onGoToChanges={goToChangesFromReview}
      />

      <MassArtModal
        open={massArtOpen}
        onClose={() => setMassArtOpen(false)}
        names={massArtNames}
        onApply={applyMassArt}
        onClearPins={clearAllArtPins}
        pinnedCount={artPinCount}
      />

      {/* URL import replaces the whole deck — confirm when the deck isn't empty */}
      {pendingImport && (
        <div className="icm-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPendingImport(null); }}>
          <div className="icm-panel icm-confirm" role="alertdialog" aria-modal="true" aria-label="Replace deck confirmation">
            <div className="icm-head">
              <h3>Replace this deck?</h3>
              <button className="icm-close" onClick={() => setPendingImport(null)} aria-label="Close">✕</button>
            </div>
            <div className="icm-body">
              <p className="icm-confirm-text">
                Importing <strong>"{pendingImport.name || "deck"}"</strong>
                {" "}({parseDeckText(pendingImport.decklist || "").totalCards} cards) will replace
                {" "}<strong>"{deckName || "Untitled deck"}"</strong> ({totalCards} cards) — name, format, and all.
                {(pendingImport.sideboard || "").trim() && " Its sideboard lands in Considering."}
              </p>
            </div>
            <div className="icm-foot">
              <button className="ghost small" onClick={() => setPendingImport(null)}>Cancel</button>
              <button className="primary small" onClick={() => { applyUrlImport(pendingImport); setPendingImport(null); }}>
                Replace deck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile FAB — open the search panel, scroll to it, and focus */}
      {!locked && (
        <button
          className="deck-fab"
          onClick={() => {
            setSection("cards");
            setSearchOpen(true);
            setTimeout(() => {
              searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              searchRef.current?.querySelector("input")?.focus();
            }, 60);
          }}
          aria-label="Add cards"
        >
          +
        </button>
      )}
    </div>
  );
}
