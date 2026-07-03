import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, assembleDecklist, disassembleDecklist, getCardImage, FORMATS } from "../../lib/api";
import CommanderInput from "../CommanderInput";
import Wizard from "../Wizard";
import CardGrid from "./CardGrid";
import CardTypeahead from "./CardTypeahead";
import DeckSidebar from "./DeckSidebar";
import ImportCardsModal from "./ImportCardsModal";
import MoreMenu from "./MoreMenu";
import Maybeboard from "./Maybeboard";
import { parseDeckText, deckCompleteness } from "../../lib/deckParser";

export default function DeckView({
  decklist, setDecklist, format, setFormat, commander, setCommander,
  maybeboard, setMaybeboard,
  deckName, deckId, onSave, onClone, onExport, onPlaytest, onShare,
  startInWizard, onWizardConsumed, startImport, onImportConsumed, onBack, notify, serverWarmed,
  pwInsightsEl,
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

  useEffect(() => {
    if (startImport) {
      setImportOpen(startImport);
      onImportConsumed?.();
    }
  }, [startImport, onImportConsumed]);
  const [result, setResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recs, setRecs] = useState(null);
  const [combos, setCombos] = useState(null);
  const [comp, setComp] = useState(null);
  const [budgetSwaps, setBudgetSwaps] = useState(null);
  const [cuts, setCuts] = useState(null);
  const [upgrades, setUpgrades] = useState(null);
  const [upgradeMode, setUpgradeMode] = useState("budget");
  const [strategy, setStrategy] = useState(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [cat, setCat] = useState("high_synergy");
  const [activePanel, setActivePanel] = useState(null);
  const [deckFilter, setDeckFilter] = useState("");
  const [skipped, setSkipped] = useState(new Set());
  const [cmdrData, setCmdrData] = useState(null);
  const [maybeOpen, setMaybeOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  const isCommanderFmt = format === "commander" || format === "paupercommander";

  // Resolve commander card image
  useEffect(() => {
    if (!commander) { setCmdrData(null); return; }
    const name = commander.split(" && ")[0];
    let cancelled = false;
    getCardImage(name).then((d) => { if (!cancelled) setCmdrData(d); });
    return () => { cancelled = true; };
  }, [commander]);

  function skip(name) { setSkipped((prev) => new Set(prev).add(name)); }

  // Auto-analyze on decklist change (debounced)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    const lines = (decklist || "").split("\n").filter((l) => /^\s*\d+\s+\S/.test(l));
    if (lines.length < 5) return;
    debounceRef.current = setTimeout(() => analyze(), 2000);
    return () => clearTimeout(debounceRef.current);
  }, [decklist, commander, format]); // eslint-disable-line react-hooks/exhaustive-deps

  async function analyze() {
    if (!decklist.trim()) return;
    setIsAnalyzing(true);
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      setResult(await api.analyze(full, format));
    } catch (e) {
      notify?.(`Analyze failed: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Auto-load strategy when deck reaches 20+ cards
  useEffect(() => {
    const lines = (decklist || "").split("\n").filter((l) => /^\s*\d+\s+\S/.test(l));
    if (lines.length < 20 || strategy) return;
    let cancelled = false;
    setStrategyLoading(true);
    const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
    api.aiStrategy?.(full, format, commander)
      .then((r) => { if (!cancelled) setStrategy(r); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStrategyLoading(false); });
    return () => { cancelled = true; };
  }, [decklist, commander, format]); // eslint-disable-line react-hooks/exhaustive-deps

  function addCard(name) {
    setDecklist((prev) => `${prev.replace(/\s*$/, "")}\n1 ${name}`);
    notify?.(`Added ${name}`);
  }

  function removeCard(name, { silent = false } = {}) {
    setDecklist((prev) => {
      const lines = prev.split("\n");
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const idx = lines.findIndex((l) => new RegExp(`^\\s*\\d+\\s+${esc}\\s*$`, "i").test(l));
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
      const re = new RegExp(`^\\s*\\d+\\s+${esc}\\s*$`, "i");
      const out = [];
      let placed = false;
      for (const l of prev.split("\n")) {
        if (re.test(l)) {
          if (!placed && qty > 0) { out.push(`${qty} ${name}`); placed = true; }
        } else {
          out.push(l);
        }
      }
      if (!placed && qty > 0) out.push(`${qty} ${name}`);
      return out.join("\n");
    });
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

  async function loadPanel(kind, fn, setter) {
    if (!decklist.trim()) return notify?.("Add some cards first.");
    setBusy(kind);
    setActivePanel(kind);
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      const r = await fn(full, format);
      setter(r);
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

  async function handleImportUrl(url) {
    try {
      const res = await api.importUrl((url || "").trim());
      const wasEmpty = mergeImportedText(res.decklist || "");
      if (wasEmpty && res.format) setFormat(res.format);
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
  const considerCount = parseDeckText(maybeboard || "").cards.length;
  const totalCards = parseDeckText(decklist).totalCards;
  const deckEmpty = !decklist.trim() && !commander;
  const completeness = deckCompleteness(totalCards, commander, format);

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
          loadPanel("Upgrades", api.budgetSwaps, setBudgetSwaps);
        } else if (upgradeMode === "power" && !upgrades) {
          loadPanel("Upgrades", (dl, fmt) => api.aiUpgrades(dl, fmt, commander, null, "power"), setUpgrades);
        }
        return;
      }
      const map = {
        Recommendations: [api.recommend, setRecs],
        Cuts: [api.aiCuts, setCuts],
        Combos: [api.combos, setCombos],
        Composition: [api.composition, setComp],
      };
      if (map[id]) loadPanel(id, ...map[id]);
    },
    recs,
    recCat: cat,
    setRecCat: setCat,
    skipped,
    onSkip: skip,
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
            { label: `Considering (${considerCount})`, icon: "☆", onClick: () => setMaybeOpen(true) },
            { label: "Share link", icon: "🔗", onClick: onShare },
            { label: "Clone deck", icon: "⎘", onClick: onClone },
            { label: "Export .txt", icon: "↓", onClick: onExport },
            ...(locked ? [] : [{ label: textEditOpen ? "Hide text editor" : "Edit as text", icon: "✎", onClick: () => setTextEditOpen((o) => !o) }]),
            { label: "Playtest", icon: "▶", onClick: onPlaytest },
            { label: "Wizard", icon: "✨", onClick: () => setMode("wizard") },
            { label: locked ? "Unlock deck" : "Lock deck (view only)", icon: locked ? "🔓" : "🔒", onClick: () => setLocked((l) => !l) },
          ]} />
        </div>
      </div>

      {/* Desktop header: title + stats row (left) · actions (right).
          Completeness/price/bracket live here — NOT in the card-grid toolbar. */}
      <div className="deck-toolbar">
        <div className="deck-toolbar-top">
          <div className="dh-left">
            <h2 className="deck-title">{deckName || "Untitled deck"}</h2>
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
            <button className="ghost small" onClick={() => setMaybeOpen(true)}>
              Considering ({considerCount})
            </button>
            <button
              className={`primary small${saveState === "saved" ? " btn-saved" : ""}`}
              disabled={saveState === "saving"}
              onClick={handleSave}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : "Save"}
            </button>
            <MoreMenu items={[
              { label: "Share link", icon: "🔗", onClick: onShare },
              { label: "Clone deck", icon: "⎘", onClick: onClone },
              { label: "Export .txt", icon: "↓", onClick: onExport },
              ...(locked ? [] : [{ label: textEditOpen ? "Hide text editor" : "Edit as text", icon: "✎", onClick: () => setTextEditOpen((o) => !o) }]),
              { label: "Wizard", icon: "✨", onClick: () => setMode("wizard") },
              { label: locked ? "Unlock deck" : "Lock deck (view only)", icon: locked ? "🔓" : "🔒", onClick: () => setLocked((l) => !l) },
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
            <div className="cmdr-strip-name">{commander.replace(" && ", " + ")}</div>
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
                    <span className="empty-action-ico">📋</span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Paste a decklist</span>
                      <span className="empty-action-d">From Arena, Moxfield, Archidekt, or any text export</span>
                    </span>
                  </button>
                  <button className="empty-action" onClick={() => setImportOpen("url")}>
                    <span className="empty-action-ico">🔗</span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Import from URL</span>
                      <span className="empty-action-d">Moxfield or Archidekt deck link</span>
                    </span>
                  </button>
                  <button className="empty-action" onClick={toggleSearch}>
                    <span className="empty-action-ico">🔍</span>
                    <span className="empty-action-txt">
                      <span className="empty-action-t">Search for cards</span>
                      <span className="empty-action-d">Build card-by-card with search &amp; filters</span>
                    </span>
                  </button>
                  <button className="empty-action" onClick={() => setMode("wizard")}>
                    <span className="empty-action-ico">✨</span>
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
            />
          )}

        </div>

        {/* Right sidebar — all panel content renders inline in accordion */}
        <DeckSidebar {...sidebarProps} />
      </div>

      {/* Mobile: the Planeswalker hub's Insights tab exposes a slot element —
          portal the same sidebar into it (single source of props, no dup wiring). */}
      {pwInsightsEl && createPortal(<DeckSidebar {...sidebarProps} />, pwInsightsEl)}

      <ImportCardsModal
        open={importOpen}
        onClose={() => setImportOpen(null)}
        onImportText={handleImportText}
        onImportUrl={handleImportUrl}
      />

      <Maybeboard
        open={maybeOpen}
        onClose={() => setMaybeOpen(false)}
        maybeboard={maybeboard}
        setMaybeboard={setMaybeboard}
        onMoveToDeck={addCard}
        onSuggest={suggestConsiderations}
        suggesting={suggesting}
        notify={notify}
      />

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
