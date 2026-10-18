import { useEffect, useMemo, useRef, useState } from "react";
import { api, assembleDecklist, disassembleDecklist, getCardImage, FORMATS, warnIfBadAdd } from "../../lib/api";
import CommanderInput from "../CommanderInput";
import CardGrid from "./CardGrid";
import CardToolbar from "./CardToolbar";
import { useCardView } from "../../lib/hooks";
import DeckTools from "./DeckTools";
import DeckGoalsAssessment from "./DeckGoalsAssessment";
import HowToPlay from "./HowToPlay";
import ImportCardsModal from "./ImportCardsModal";
import MassArtModal from "./MassArtModal";
import UpgradeReview from "./UpgradeReview";
import MoreMenu from "./MoreMenu";
import { PaletteIcon, LinkIcon, LockIcon, UnlockIcon, ListIcon, SearchIcon } from "../Icons";
import { parseDeckText, deckCompleteness, setPrintingInText, splitCommanders, commanderNamesClean, setCommanderPrinting } from "../../lib/deckParser";
import { goalsToApi } from "../../lib/goals";
import { isVisibleEntry } from "../../lib/optimizeLog";
import { deckSignature } from "../../lib/insightsCache";
import { useInsightCache } from "../../lib/useInsightCache";
import { useAiChanges } from "../../lib/useAiChanges";
import { clearBuildNotes } from "../../lib/buildNotes";
import {
  findDeckLine as findLine, appendLine as appendLineText,
  removeLine as removeLineText, setQty as setQtyText,
} from "../../lib/decklistEdit";
import { fmtUsd } from "../../lib/format";
import NavLink from "../layout/NavLink";
import AskButton from "../layout/AskButton";

// The deck's sections, as tabs under its header (UX overhaul job 3.1).
const SECTIONS = [["cards", "Cards"], ["play", "How to play"], ["improve", "Improve"], ["stats", "Stats"]];
const STRATEGY_MIN_CARDS = 20;

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
  goals, setGoals, onAsk, askOpen,
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
  // Goals' editor open state, collapsed by default, persisted as "1"/"0"
  // behind a try/catch.
  const [goalsOpen, setGoalsOpen] = useState(
    () => { try { return localStorage.getItem("mtgweb:goalsOpen") === "1"; } catch { return false; } }
  );
  function toggleGoalsOpen(next) {
    setGoalsOpen(next);
    try { localStorage.setItem("mtgweb:goalsOpen", next ? "1" : "0"); } catch { /* best-effort */ }
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

  // The deck's insight results and the verdicts on its suggestions, with their
  // persistence: lib/useInsightCache.js. Everything below is state of this page.
  const insightCache = useInsightCache(deckId);
  const {
    result, setResult, comp, setComp, recs, combos, setCombos,
    budgetSwaps, ratings, setRatings, strategy, setStrategy,
    upgradeMode, setUpgradeMode, panelSigs, markFresh, activePanel, setActivePanel,
    skipped, pinned, setPinned, dismissedCuts, declinedUpgrades, insightDecided,
    togglePin, clearSkipped, clearDismissedCuts, clearDeclinedUpgrades,
    hydratedFor,
  } = insightCache;
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // Set once an analysis has run, whether or not it worked: a deck with cards and no
  // result is "waiting for the first analysis" only until then (a failed one ends it).
  const [analysisTried, setAnalysisTried] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState("");
  const [busy, setBusy] = useState("");
  const [cat, setCat] = useState("high_synergy");
  const [deckFilter, setDeckFilter] = useState("");
  const [cmdrData, setCmdrData] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const cardView = useCardView();
  const debounceRef = useRef(null);

  const isCommanderFmt = format === "commander" || format === "paupercommander";

  // Card-presence signature of the deck as it stands now — quantity tweaks and
  // art/printing pins don't change it, so they never invalidate cached results.
  const currentSig = useMemo(
    () => deckSignature(decklist, isCommanderFmt ? commander : "", format),
    [decklist, commander, format, isCommanderFmt],
  );
  // Switching decks: back to Cards, and clear the strategy request state. The
  // insight results (useInsightCache) and the AI changes (useAiChanges) reload
  // themselves.
  useEffect(() => {
    setSection("cards"); // eslint-disable-line react-hooks/set-state-in-effect
    setStrategyError("");
    setStrategyLoading(false);
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
      setAnalysisTried(true);
    }
  }

  // How to play (job 3.4): one paid call per deck, made when the tab is first
  // opened and again only on "Write it again". Editing the deck never fires it;
  // the tab says the cards have changed instead.
  const strategyEnough = (decklist || "").split("\n").filter((l) => /^\s*\d+\s+\S/.test(l)).length >= STRATEGY_MIN_CARDS;
  function runStrategy() {
    if (strategyLoading || !strategyEnough) return;
    const sig = currentSig; // capture: the deck may be edited mid-flight
    const forDeck = deckId;
    const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
    setStrategyLoading(true);
    setStrategyError("");
    api.aiStrategy(full, format, commander)
      .then((r) => {
        if (hydratedFor.current !== forDeck) return; // switched decks meanwhile
        if (r?.error) { setStrategyError(r.message || "Could not write how to play."); return; }
        setStrategy(r);
        markFresh("strategy", sig);
      })
      .catch(() => { if (hydratedFor.current === forDeck) setStrategyError("Could not write how to play. Try again."); })
      .finally(() => setStrategyLoading(false));
  }

  // The exact decklist line for a card (with its qty + printing), so an Undo can
  // restore it verbatim instead of a lossy "1 Name".
  const findDeckLine = (name) => findLine(decklist, name);
  function appendLine(line) {
    setDecklist((prev) => appendLineText(prev, line));
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
    setDecklist((prev) => removeLineText(prev, name));
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
    setDecklist((prev) => setQtyText(prev, name, qty));
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

  // "Add a card by name" is on the strip in Cards (job 3.3); this puts the
  // cursor in it, for the empty deck's "Search for cards" (which is in Cards,
  // so the field is there). Found by id, as openSection finds the strip.
  function focusAddCard() {
    document.querySelector("#deck-add-card input")?.focus();
  }

  // Ask the chat endpoint for 12 cards, validate them server-side (exact name,
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

  // The AI changes: the pass, its session log, and the Suggested changes list
  // (lib/useAiChanges.js). Called after useInsightCache, whose result it reads.
  const {
    optimize, optimizing, optLog, runOptimize, undoOptChange, clearOptLog,
    stalePanels, loadChanges, changeUpgradeMode, applyInsightChange, skipInsightChange,
    changes, changeCount,
  } = useAiChanges({
    deckId, decklist, commander, format, isCommanderFmt, currentSig, apiGoals,
    notify, openSection, busy, setBusy, recCat: cat,
    cache: insightCache,
    edits: { findDeckLine, removeCard, appendLine },
  });

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

  // One props object for Improve and Stats (Goals, Verdict and both
  // DeckTools renders) — keep wiring in one place.
  // The first analysis starts 2s after the deck loads (the debounce above), so for
  // that long a deck with cards has no result and is not yet "analyzing".
  const analysisDue = !result && !analysisTried
    && (decklist || "").split("\n").filter((l) => /^\s*\d+\s+\S/.test(l)).length >= 5;
  const toolProps = {
    result,
    isAnalyzing,
    analysisDue,
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
    serverWarmed,
    goals,
    setGoals,
    deckCardNames,
    goalSuggestion,
    onAcceptGoalSuggestion: acceptGoalSuggestion,
    onDismissGoalSuggestion: dismissGoalSuggestion,
    goalsOpen,
    onToggleGoals: toggleGoalsOpen,
    changes,
    // The AI pass's own read of the deck, as the Verdict's sentence, while it
    // still matches the cards on screen.
    verdictNote: optimize?.assessment && panelSigs.optimize === currentSig ? optimize.assessment : null,
    optimize,
    optimizing,
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
          {onAsk && <AskButton className="mobile-deck-ask" onClick={onAsk} pressed={askOpen} />}
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
        {/* One strip: the tabs, then in Cards its toolbar (job 3.3). */}
        <div className="deck-strip">
          <div className="deck-sections" id="deck-sections" role="tablist" aria-label="Deck sections">
            {SECTIONS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`deck-tab-${id}`}
                aria-controls={`deck-panel-${id}`}
                aria-selected={section === id}
                aria-describedby={id === "improve" && changeCount > 0 ? "improve-count-note" : undefined}
                className="deck-section-tab"
                // Opening Improve loads its Changes: free EDHREC suggestions,
                // reused once loaded. The paid passes wait for their own buttons.
                onClick={() => {
                  if (id === "improve" && decklist.trim()) loadChanges();
                  else openSection(id);
                  // Only a deck with no write-up, or one cached before the game plan existed.
                  if (id === "play" && (!strategy || !("game_plan" in strategy))) runStrategy();
                }}
              >
                {label}
                {/* The count is aria-hidden so the tab keeps its name; the
                    note below says it to a screen reader instead. */}
                {id === "improve" && changeCount > 0 && (
                  <span className="deck-section-count" aria-hidden="true">{changeCount}</span>
                )}
              </button>
            ))}
          </div>
          {changeCount > 0 && (
            <span id="improve-count-note" className="visually-hidden">
              {changeCount} suggested {changeCount === 1 ? "change" : "changes"}
            </span>
          )}
          {section === "cards" && (
            <CardToolbar
              view={cardView}
              addCard={locked ? null : addCard}
              notify={notify}
              filter={deckFilter}
              setFilter={setDeckFilter}
              viewControls={!deckEmpty}
            />
          )}
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
          {deckEmpty ? (
            <div className="empty-deck">
              <div className="empty-deck-inner">
                {/* The ways to start a deck are on the New deck screen. This deck
                    exists already: these two add cards to it. */}
                <h3>Your deck is empty</h3>
                <p className="muted">Add cards one at a time, or bring in a list.</p>
                <div className="empty-actions">
                  <button className="empty-action" onClick={focusAddCard} disabled={locked}>
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
              viewMode={cardView.viewMode}
              stackMode={cardView.stackMode}
              sortBy={cardView.sortBy}
              groupBy={cardView.groupBy}
              onRemove={locked ? null : removeCard}
              onConsider={locked ? null : addToConsidering}
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

        {/* How to play: strategy, game plan, key synergies (one AI call per
            deck), then the upgrade path from the composition gaps (no AI). */}
        <div role="tabpanel" id="deck-panel-play" aria-labelledby="deck-tab-play"
          className="deck-section-panel" hidden={section !== "play"}>
          <HowToPlay
            strategy={strategy}
            loading={strategyLoading}
            error={strategyError}
            stale={Boolean(panelSigs.strategy && panelSigs.strategy !== currentSig)}
            enough={strategyEnough}
            minCards={STRATEGY_MIN_CARDS}
            comp={comp}
            onWriteAgain={runStrategy}
            onOpenImprove={() => (decklist.trim() ? loadChanges() : openSection("improve"))}
          />
        </div>

        {/* Improve (`Improve`): Goals, the Verdict and the Gaps in a column
            beside the Suggested changes. */}
        <div role="tabpanel" id="deck-panel-improve" aria-labelledby="deck-tab-improve"
          className="deck-section-panel" hidden={section !== "improve"}>
          <div className={`improve${deckEmpty ? " improve-solo" : ""}`}>
            {!deckEmpty && <DeckGoalsAssessment {...toolProps} />}
            <DeckTools {...toolProps} section="improve" />
          </div>
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

    </div>
  );
}
