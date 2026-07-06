import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, assembleDecklist, disassembleDecklist, getCardImage, FORMATS } from "../../lib/api";
import CommanderInput from "../CommanderInput";
import Wizard from "../Wizard";
import CardGrid from "./CardGrid";
import CardTypeahead from "./CardTypeahead";
import DeckSidebar from "./DeckSidebar";
import ImportCardsModal from "./ImportCardsModal";
import MassArtModal from "./MassArtModal";
import MoreMenu from "./MoreMenu";
import { PaletteIcon, LinkIcon, SparkleIcon, LockIcon, UnlockIcon, ListIcon, SearchIcon } from "../Icons";
import { parseDeckText, deckCompleteness, setPrintingInText, splitCommanders, commanderDisplay, setCommanderPrinting } from "../../lib/deckParser";
import { goalsToApi } from "../../lib/goals";
import { loadLog, appendLog, removeLogEntry, clearLog, describeEntry, makeEntry } from "../../lib/optimizeLog";
import { deckSignature, loadInsights, saveInsights, PANEL_KEYS } from "../../lib/insightsCache";

export default function DeckView({
  decklist, setDecklist, format, setFormat, commander, setCommander,
  maybeboard, setMaybeboard,
  deckName, deckId, onSave, onClone, onExport, onPlaytest, onShare, onRenameDeck,
  startInWizard, onWizardConsumed, startImport, onImportConsumed, onBack, notify, serverWarmed,
  pwInsightsEl, pwStatsEl, goals, setGoals,
}) {
  const [mode, setMode] = useState(startInWizard ? "wizard" : "manual");
  const [textEditOpen, setTextEditOpen] = useState(false);

  useEffect(() => {
    if (startInWizard) {
      setMode("wizard");
      onWizardConsumed?.();
    }
  }, [startInWizard, onWizardConsumed]);
  const [importOpen, setImportOpen] = useState(null); // null | "paste" | "url"
  const [massArtOpen, setMassArtOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState(null); // URL import awaiting replace-confirm
  const [titleEdit, setTitleEdit] = useState(null); // null | in-progress rename text

  // Suggested-goals dismissal — per deck, persists. (Hook lives up here with the
  // rest of the state: it must run on every render, including wizard mode.)
  const readSuggDismissed = (id) => {
    try { return localStorage.getItem(`mtgweb:goalsugg:${id || "current"}`) === "1"; } catch { return true; }
  };
  const [suggState, setSuggState] = useState(() => ({ deckId, dismissed: readSuggDismissed(deckId) }));
  if (suggState.deckId !== deckId) setSuggState({ deckId, dismissed: readSuggDismissed(deckId) });

  useEffect(() => {
    if (startImport) {
      setImportOpen(startImport);
      onImportConsumed?.();
    }
  }, [startImport, onImportConsumed]);
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
  const [cuts, setCuts] = useState(() => hp("cuts"));
  const [upgrades, setUpgrades] = useState(() => hp("upgrades"));
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
  const [activePanel, setActivePanel] = useState(hydrated?.activePanel ?? null);
  const [deckFilter, setDeckFilter] = useState("");
  // Per-suggestion user verdicts — persisted with the insight cache and, unlike
  // panel results, never invalidated by deck edits: a skip stays skipped and a
  // pin stays pinned until the user says otherwise (or the card enters the deck).
  const [skipped, setSkipped] = useState(() => new Set(hydrated?.dismissed || []));
  const [pinned, setPinned] = useState(() => new Set(hydrated?.pinned || []));
  const [dismissedCuts, setDismissedCuts] = useState(() => new Set(hydrated?.dismissedCuts || []));
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
    setOptimize(null);
    setOptDecided({});
    const c = loadInsights(deckId);
    const d = (k) => c?.panels?.[k]?.data ?? null;
    setResult(d("result")); setComp(d("comp")); setRecs(d("recs")); setCuts(d("cuts"));
    setCombos(d("combos")); setBudgetSwaps(d("budgetSwaps")); setUpgrades(d("upgrades")); setStrategy(d("strategy"));
    setActivePanel(c?.activePanel ?? null);
    if (c?.upgradeMode) setUpgradeMode(c.upgradeMode);
    setSkipped(new Set(c?.dismissed || []));
    setPinned(new Set(c?.pinned || []));
    setDismissedCuts(new Set(c?.dismissedCuts || []));
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
    const data = { result, comp, recs, cuts, combos, budgetSwaps, upgrades, strategy };
    const panels = {};
    for (const k of PANEL_KEYS) {
      if (data[k] != null) panels[k] = { data: data[k], sig: panelSigs[k] || null };
    }
    saveInsights(deckId, {
      panels, activePanel, upgradeMode,
      pinned: [...pinned], dismissed: [...skipped], dismissedCuts: [...dismissedCuts],
    });
  }, [deckId, result, comp, recs, cuts, combos, budgetSwaps, upgrades, strategy, activePanel, upgradeMode, panelSigs, pinned, skipped, dismissedCuts]);

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
  function dismissCut(name) { setDismissedCuts((prev) => new Set(prev).add(name)); }
  function clearSkipped() { setSkipped(new Set()); }
  function clearDismissedCuts() { setDismissedCuts(new Set()); }

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

  function addCard(name) {
    setDecklist((prev) => `${prev.replace(/\s*$/, "")}\n1 ${name}`);
    // A pinned suggestion that lands in the deck has served its purpose.
    setPinned((prev) => { if (!prev.has(name)) return prev; const n = new Set(prev); n.delete(name); return n; });
    notify?.(`Added ${name}`);
  }

  // Deck lines may carry a pinned printing suffix: "1 Sol Ring (C21) 263".
  const PRINT_SUFFIX_SRC = "(\\s+\\([A-Za-z0-9]{2,6}\\)\\s+[A-Za-z0-9★†-]{1,10})?";

  function removeCard(name, { silent = false } = {}) {
    setDecklist((prev) => {
      const lines = prev.split("\n");
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const idx = lines.findIndex((l) => new RegExp(`^\\s*\\d+\\s+${esc}${PRINT_SUFFIX_SRC}\\s*$`, "i").test(l));
      if (idx >= 0) lines.splice(idx, 1);
      return lines.join("\n");
    });
    if (!silent) notify?.(`Removed ${name}`);
  }

  function swapCard(oldName, newName) {
    removeCard(oldName);
    addCard(newName);
    skip(oldName);
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
    const prev = maybeboard || "";
    const has = prev.split("\n").some((l) => l.trim().replace(/^\d+\s+/, "").toLowerCase() === name.toLowerCase());
    if (!has) setMaybeboard?.(`${prev.replace(/\s*$/, "")}\n1 ${name}`.trim());
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

  // Ask the Planeswalker for ~8 cards to weigh, parse "Card Name — reason" lines,
  // and drop them into the considering pile.
  async function suggestConsiderations() {
    setSuggesting(true);
    try {
      const full = assembleDecklist(decklist || "", commander || "");
      const prompt = "Suggest 8 specific cards I should CONSIDER adding to this deck. " +
        "Reply with one card per line in the exact format: `1 Card Name — short reason`. " +
        "Only real Magic cards legal in this deck's colors. No preamble.";
      const r = await api.planeswalkerChat([{ role: "user", content: prompt }], full, format, commander);
      const text = r?.response || "";
      const names = text.split("\n")
        .map((l) => l.trim().match(/^\d+\s+(.+?)\s*(?:[—-]\s*.+)?$/))
        .filter(Boolean)
        .map((m) => m[1].trim())
        .filter((n) => n && n.length < 60);
      if (!names.length) { notify?.("No suggestions parsed — try again."); return; }
      names.forEach(addToConsidering);
      notify?.(`Added ${names.length} cards to consider`);
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
      mergeImportedText(text);
    } catch (e) {
      notify?.(`Import failed: ${e.message}`);
      throw e;
    }
  }

  // URL imports REPLACE the deck (a linked deck is a complete deck, not a card
  // pack). Empty deck → apply immediately; populated deck → confirm first.
  function applyUrlImport(res) {
    const { commander: impCmdr, deckText: impMain, maybeboard: impMaybe } = disassembleDecklist(res.decklist || "");
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
      if (deckPopulated) setPendingImport(res); // confirm before replacing
      else applyUrlImport(res);
    } catch (e) {
      notify?.(`Import failed: ${e.message}`);
      throw e;
    }
  }

  function handleWizardFinish(dl, cmd) {
    setDecklist(dl.split("\n").filter((l) => !/^\s*(Commander|Deck)\s*$/i.test(l)).join("\n"));
    setCommander(cmd);
    setMode("manual");
    notify?.("Deck loaded from wizard — tune it here.");
  }

  if (mode === "wizard") {
    return (
      <div>
        <div className="panel">
          <div className="spread">
            <span />
            <button className="ghost small" onClick={() => setMode("manual")}>← Back to deck view</button>
          </div>
        </div>
        <Wizard onFinish={handleWizardFinish} notify={notify} />
      </div>
    );
  }

  const hasCommander = isCommanderFmt && commander;
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
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      const r = await api.optimize(full, format, apiGoals,
        typeof focus === "string" ? focus : null);
      r.changes = (r.changes || []).map((c, i) => ({ ...c, id: `${i}:${c.cut || ""}>${c.add || ""}` }));
      setOptimize(r);
      setOptDecided({});
    } catch (e) {
      notify?.(`Optimize failed: ${e.message}`);
    } finally {
      setOptimizing(false);
    }
  }

  function applyOptChange(ch) {
    if (ch.cut) removeCard(ch.cut, { silent: true });
    if (ch.add) setDecklist((prev) => `${prev.replace(/\s*$/, "")}\n1 ${ch.add}`);
    setOptDecided((d) => ({ ...d, [ch.id]: "applied" }));
    const entry = makeEntry({ action: ch.action, cut: ch.cut || null, add: ch.add || null });
    setOptLog(appendLog(deckId, entry));
    notify?.(describeEntry(entry));
  }

  function skipOptChange(ch) {
    setOptDecided((d) => ({ ...d, [ch.id]: "skipped" }));
  }

  function undoOptChange(entry) {
    if (entry.add) removeCard(entry.add, { silent: true });
    if (entry.cut) setDecklist((prev) => `${prev.replace(/\s*$/, "")}\n1 ${entry.cut}`);
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
    check("recs", "Recommendations", recs);
    check("cuts", "Cuts", cuts);
    check("combos", "Combos", combos);
    if (upgradeMode === "budget") check("budgetSwaps", "Upgrades", budgetSwaps);
    else check("upgrades", "Upgrades", upgrades);
  }

  // One props object for every DeckSidebar render (desktop layout + the
  // Planeswalker hub's mobile Insights portal) — keep wiring in one place.
  const sidebarProps = {
    result,
    isAnalyzing,
    activePanel,
    busy,
    onPanelClick: (id) => {
      if (activePanel === id) { setActivePanel(null); return; }
      if (id === "DrawOdds") { setActivePanel("DrawOdds"); return; }
      if (id === "Upgrades") {
        setActivePanel("Upgrades");
        if (upgradeMode === "budget" && !budgetSwaps) {
          loadPanel("Upgrades", api.budgetSwaps, setBudgetSwaps, "budgetSwaps");
        } else if (upgradeMode === "power" && !upgrades) {
          loadPanel("Upgrades", (dl, fmt) => api.aiUpgrades(dl, fmt, commander, null, "power", apiGoals), setUpgrades, "upgrades");
        }
        return;
      }
      // Tab switches reuse loaded data (Cuts is a paid AI call — don't refetch
      // just for browsing); the pane's Refresh action forces a reload.
      const cached = { Recommendations: recs, Cuts: cuts, Combos: combos }[id];
      if (cached) { setActivePanel(id); return; }
      const map = {
        Recommendations: [api.recommend, setRecs, "recs"],
        Cuts: [(dl, fmt) => api.aiCuts(dl, fmt, null, apiGoals), setCuts, "cuts"],
        Combos: [api.combos, setCombos, "combos"],
      };
      if (map[id]) loadPanel(id, ...map[id]);
    },
    onRefreshPanel: (id) => {
      if (id === "Upgrades") {
        if (upgradeMode === "budget") loadPanel("Upgrades", api.budgetSwaps, setBudgetSwaps, "budgetSwaps");
        else loadPanel("Upgrades", (dl, fmt) => api.aiUpgrades(dl, fmt, commander, null, "power", apiGoals), setUpgrades, "upgrades");
        return;
      }
      const map = {
        Recommendations: [api.recommend, setRecs, "recs"],
        Cuts: [(dl, fmt) => api.aiCuts(dl, fmt, null, apiGoals), setCuts, "cuts"],
        Combos: [api.combos, setCombos, "combos"],
      };
      if (map[id]) loadPanel(id, ...map[id]);
    },
    stalePanels,
    recs,
    recCat: cat,
    setRecCat: setCat,
    skipped,
    onSkip: skip,
    onClearSkipped: clearSkipped,
    pinned,
    onTogglePin: togglePin,
    dismissedCuts,
    onDismissCut: dismissCut,
    onClearDismissedCuts: clearDismissedCuts,
    onAddCard: addCard,
    combos,
    comp,
    budgetSwaps,
    onSwapCard: swapCard,
    cuts,
    onRemoveCard: removeCard,
    upgrades,
    upgradeMode,
    setUpgradeMode,
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
    optimize,
    optimizing,
    onRunOptimize: runOptimize,
    optGapCount: comp?.categories?.filter((c) => c.status === "thin").length || 0,
    optDecided,
    onApplyChange: applyOptChange,
    onSkipChange: skipOptChange,
    optLog,
    onUndoChange: undoOptChange,
    onClearLog: clearOptLog,
    onGapChip: runOptimize,
    // Over-budget chip → Budget swaps, pre-set to budget mode.
    onOverBudget: () => {
      setUpgradeMode("budget");
      if (budgetSwaps) { setActivePanel("Upgrades"); return; }
      loadPanel("Upgrades", api.budgetSwaps, setBudgetSwaps, "budgetSwaps");
    },
  };

  return (
    <div>
      {/* Mobile nav bar — visible only on mobile */}
      <div className="mobile-deck-nav">
        <button className="mobile-deck-back" onClick={onBack}>&#8249; Decks</button>
        <span className="mobile-deck-name">{deckName || "Untitled deck"}</span>
        <div className="mobile-deck-actions">
          <button
            className={`primary small mobile-deck-save${saveState === "saved" ? " btn-saved" : ""}`}
            disabled={saveState === "saving"}
            onClick={async () => {
              setSaveState("saving");
              try { await onSave(); setSaveState("saved"); setTimeout(() => setSaveState("idle"), 2000); }
              catch { setSaveState("idle"); }
            }}
          >
            {saveState === "saving" ? "…" : saveState === "saved" ? "Saved" : "Save"}
          </button>
          <MoreMenu items={[
            ...(locked ? [] : [{ label: "Import cards", icon: "⤓", onClick: () => setImportOpen("paste") }]),
            ...(!locked && onRenameDeck ? [{ label: "Rename deck", icon: "✎", onClick: renameDeck }] : []),
            ...(locked ? [] : [{ label: "Mass change art", icon: <PaletteIcon />, onClick: () => setMassArtOpen(true) }]),
            { label: "Share link", icon: <LinkIcon />, onClick: onShare },
            { label: "Clone deck", icon: "⎘", onClick: onClone },
            { label: "Export .txt", icon: "↓", onClick: onExport },
            ...(locked ? [] : [{ label: textEditOpen ? "Hide text editor" : "Edit as text", icon: "✎", onClick: () => setTextEditOpen((o) => !o) }]),
            { label: "Playtest", icon: "▶", onClick: onPlaytest },
            { label: "Wizard", icon: <SparkleIcon />, onClick: () => setMode("wizard") },
            { label: locked ? "Unlock deck" : "Lock deck (view only)", icon: locked ? <UnlockIcon /> : <LockIcon />, onClick: () => setLocked((l) => !l) },
          ]} />
        </div>
      </div>

      {/* Desktop header: title + stats row (left) · actions (right).
          Completeness/price/bracket live here — NOT in the card-grid toolbar. */}
      <div className="deck-toolbar">
        <div className="deck-toolbar-top">
          <div className="dh-left">
            {titleEdit == null ? (
              <h2 className="deck-title" onDoubleClick={locked ? undefined : () => setTitleEdit(deckName || "Untitled deck")}>
                {deckName || "Untitled deck"}
                {!locked && onRenameDeck && (
                  <button className="dh-rename" aria-label="Rename deck" title="Rename deck"
                    onClick={() => setTitleEdit(deckName || "Untitled deck")}>✎</button>
                )}
              </h2>
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
            <div className="dh-stats">
              <select
                className="dh-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                disabled={locked}
                aria-label="Deck format"
              >
                {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <span className={`badge ${completeness.status}`} title={completeness.title}>{completeness.label}</span>
              {result?.bracket?.bracket != null && (
                <span className="dh-stat" title="Estimated bracket">Bracket {result.bracket.bracket}</span>
              )}
              {result?.breakdown?.price_usd != null && (
                <span className="dh-stat" title="Estimated deck price">Est. ${Math.round(result.breakdown.price_usd)}</span>
              )}
              {locked && <span className="dh-stat dh-locked" title="Deck is locked (view only)">🔒 Locked</span>}
            </div>
          </div>
          <div className="row dh-actions" style={{ gap: ".4rem", alignItems: "center" }}>
            <button className="ghost small" onClick={() => setImportOpen("paste")} disabled={locked}>
              ⤓ Import cards
            </button>
            <button className="ghost small" onClick={onPlaytest}>▶ Playtest</button>
            <button
              className={`primary small${saveState === "saved" ? " btn-saved" : ""}`}
              disabled={saveState === "saving"}
              onClick={handleSave}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : "Save"}
            </button>
            <MoreMenu items={[
              ...(!locked && onRenameDeck ? [{ label: "Rename deck", icon: "✎", onClick: renameDeck }] : []),
              ...(locked ? [] : [{ label: "Mass change art", icon: <PaletteIcon />, onClick: () => setMassArtOpen(true) }]),
              { label: "Share link", icon: <LinkIcon />, onClick: onShare },
              { label: "Clone deck", icon: "⎘", onClick: onClone },
              { label: "Export .txt", icon: "↓", onClick: onExport },
              ...(locked ? [] : [{ label: textEditOpen ? "Hide text editor" : "Edit as text", icon: "✎", onClick: () => setTextEditOpen((o) => !o) }]),
              { label: "Wizard", icon: <SparkleIcon />, onClick: () => setMode("wizard") },
              { label: locked ? "Unlock deck" : "Lock deck (view only)", icon: locked ? <UnlockIcon /> : <LockIcon />, onClick: () => setLocked((l) => !l) },
            ]} />
          </div>
        </div>
      </div>

      {/* Commander picker — outside the desktop-only toolbar so mobile can set
          or change a commander too (the toolbar is display:none under 700px). */}
      {isCommanderFmt && !commander && (
        <div className="cmdr-input-row">
          <CommanderInput commander={commander} setCommander={setCommander} />
        </div>
      )}

      {/* Mobile commander strip */}
      {hasCommander && (
        <div className="cmdr-strip-mobile">
          <div className="cmdr-strip-art">
            {cmdrData?.art_crop ? <img src={cmdrData.art_crop} alt="" /> : null}
          </div>
          <div className="cmdr-strip-info">
            <div className="cmdr-strip-name">{commanderDisplay(commander)}</div>
            <div className="cmdr-strip-meta">
              <span className="cmdr-strip-label">Commander</span>
              <span className="cmdr-strip-dot">&middot;</span>
              {(cmdrData?.color_identity || []).map((c) => (
                <span key={c} className={`cmdr-strip-pip pip-${c}`}>{c}</span>
              ))}
              {result?.bracket?.bracket != null && (
                <span className="cmdr-strip-bracket">B{result.bracket.bracket}</span>
              )}
            </div>
          </div>
          <div className="cmdr-strip-stats">
            <span className="cmdr-strip-count">
              {result?.total_cards != null
                ? `${result.total_cards + (commander ? commander.split(" && ").filter(Boolean).length : 0)}/100`
                : "—/100"}
            </span>
            {result?.breakdown?.price_usd != null && (
              <span className="cmdr-strip-price">${Math.round(result.breakdown.price_usd)}</span>
            )}
          </div>
        </div>
      )}

      {/* Main layout: deck grid + AI sidebar. The commander now renders as a
          crowned leading column inside the grid (CardGrid), not a side panel. */}
      <div className="deck-layout">
        <div className="deck-main">
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
              placeholder={"1 Sol Ring\n1 Llanowar Elves\n..."}
              aria-label="Edit decklist as text"
            />
          )}
          {deckEmpty && !searchOpen ? (
            <div className="empty-deck">
              <div className="empty-deck-inner">
                <h3>Your deck is empty</h3>
                <p className="muted">Add cards any way you like — every option is one click away.</p>
                <div className="empty-actions">
                  <button className="empty-action" onClick={() => setImportOpen("paste")}>
                    <span className="empty-action-ico"><ListIcon size={18} /></span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Paste a decklist</span>
                      <span className="empty-action-d">From Arena, Moxfield, Archidekt, or any text export</span>
                    </span>
                  </button>
                  <button className="empty-action" onClick={() => setImportOpen("url")}>
                    <span className="empty-action-ico"><LinkIcon size={18} /></span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Import from URL</span>
                      <span className="empty-action-d">Moxfield or Archidekt deck link</span>
                    </span>
                  </button>
                  <button className="empty-action" onClick={toggleSearch}>
                    <span className="empty-action-ico"><SearchIcon size={18} /></span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Search for cards</span>
                      <span className="empty-action-d">Build card-by-card with search &amp; filters</span>
                    </span>
                  </button>
                  <button className="empty-action" onClick={() => setMode("wizard")}>
                    <span className="empty-action-ico"><SparkleIcon size={18} /></span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Guided build</span>
                      <span className="empty-action-d">Pick a commander — AI helps fill each category</span>
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

        {/* Right sidebar — copilot spine + tabbed insights toolbox */}
        <DeckSidebar {...sidebarProps} />
      </div>

      {/* Mobile: the Planeswalker hub's Optimize and Stats tabs expose slot
          elements — portal sections of the same sidebar into them (single
          source of props, no dup wiring). */}
      {pwInsightsEl && createPortal(<DeckSidebar {...sidebarProps} section="optimize" />, pwInsightsEl)}
      {pwStatsEl && createPortal(<DeckSidebar {...sidebarProps} section="stats" />, pwStatsEl)}

      <ImportCardsModal
        open={importOpen}
        onClose={() => setImportOpen(null)}
        onImportText={handleImportText}
        onImportUrl={handleImportUrl}
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
