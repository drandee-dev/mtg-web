import { useCallback, useEffect, useRef, useState } from "react";
import { api, assembleDecklist, getCardImage, FORMATS } from "../../lib/api";
import CommanderInput from "../CommanderInput";
import Wizard from "../Wizard";
import CardGrid from "./CardGrid";
import DeckInput from "./DeckInput";
import DeckSidebar from "./DeckSidebar";
import MoreMenu from "./MoreMenu";
import Maybeboard from "./Maybeboard";
import { parseDeckText } from "../../lib/deckParser";

export default function DeckView({
  decklist, setDecklist, format, setFormat, commander, setCommander,
  maybeboard, setMaybeboard,
  deckName, deckId, onSave, onClone, onExport, onPlaytest, onShare,
  startInWizard, onWizardConsumed, onBack, notify, serverWarmed,
}) {
  const [mode, setMode] = useState(startInWizard ? "wizard" : "manual");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeCounts, setTypeCounts] = useState({});

  useEffect(() => {
    if (startInWizard) {
      setMode("wizard");
      onWizardConsumed?.();
    }
  }, [startInWizard, onWizardConsumed]);
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
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
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

  const CATEGORY_TABS = [
    ["all", "All"],
    ["creature", "Creatures"],
    ["instant", "Instants"],
    ["sorcery", "Sorceries"],
    ["artifact", "Artifacts"],
    ["enchantment", "Enchantments"],
    ["land", "Lands"],
  ];

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
            { label: "Share link", icon: "🔗", onClick: onShare },
            { label: "Clone deck", icon: "⎘", onClick: onClone },
            { label: "Export .txt", icon: "↓", onClick: onExport },
            { label: "Playtest", icon: "▶", onClick: onPlaytest },
          ]} />
        </div>
      </div>

      {/* Desktop toolbar */}
      <div className="deck-toolbar">
        <div className="deck-toolbar-top">
          <h2 className="deck-title">{deckName || "Untitled deck"}</h2>
          <div className="row" style={{ gap: ".4rem", alignItems: "center" }}>
            <button
              className={`deck-lock-btn ghost small${locked ? " locked" : ""}`}
              onClick={() => setLocked((l) => !l)}
              aria-label={locked ? "Unlock deck for editing" : "Lock deck (view only)"}
              title={locked ? "Unlock deck" : "Lock deck"}
            >
              {locked ? "🔒" : "🔓"}
            </button>
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }} disabled={locked}>
              {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <button onClick={() => setMode("wizard")} className="ghost small" style={{ borderColor: "var(--accent)" }}>
              ✨ Wizard
            </button>
            <button className="ghost small" onClick={() => setMaybeOpen(true)}>
              Considering ({considerCount})
            </button>
            <button
              className={`primary small${saveState === "saved" ? " btn-saved" : ""}`}
              disabled={saveState === "saving"}
              onClick={async () => {
                setSaveState("saving");
                try { await onSave(); setSaveState("saved"); setTimeout(() => setSaveState("idle"), 2000); }
                catch { setSaveState("idle"); }
              }}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : "Save"}
            </button>
            <MoreMenu items={[
              { label: "Share link", icon: "🔗", onClick: onShare },
              { label: "Clone deck", icon: "⎘", onClick: onClone },
              { label: "Export .txt", icon: "↓", onClick: onExport },
              { label: "Playtest", icon: "▶", onClick: onPlaytest },
            ]} />
          </div>
        </div>
        {isCommanderFmt && !commander && (
          <CommanderInput commander={commander} setCommander={setCommander} />
        )}
      </div>

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

      {/* Category tabs bar */}
      <div className="category-tabs">
        {CATEGORY_TABS.map(([id, label]) => (
          <button
            key={id}
            className={`category-tab${categoryFilter === id ? " active" : ""}`}
            onClick={() => setCategoryFilter(id)}
          >
            {label}{typeCounts[id] != null ? ` (${typeCounts[id]})` : ""}
          </button>
        ))}
      </div>

      {/* Main layout: deck grid + AI sidebar. The commander now renders as a
          crowned leading column inside the grid (CardGrid), not a side panel. */}
      <div className="deck-layout">
        <div className="deck-main">
          <DeckInput
            ref={searchRef}
            decklist={decklist}
            setDecklist={setDecklist}
            addCard={addCard}
            notify={notify}
            locked={locked}
            open={searchOpen}
          />
          <CardGrid
            decklist={decklist}
            commander={commander}
            format={format}
            deckId={deckId}
            filter={deckFilter}
            setFilter={setDeckFilter}
            typeFilter={categoryFilter}
            onRemove={locked ? null : removeCard}
            onConsider={locked ? null : addToConsidering}
            addCard={locked ? null : addCard}
            onCardSearch={locked ? null : toggleSearch}
            onSave={locked ? null : handleSave}
            saveState={saveState}
            onTypeCounts={setTypeCounts}
            notify={notify}
            onChangeCommander={locked ? null : () => setCommander("")}
            setCardQty={locked ? null : setCardQty}
          />

        </div>

        {/* Right sidebar — all panel content renders inline in accordion */}
        <DeckSidebar
          result={result}
          isAnalyzing={isAnalyzing}
          activePanel={activePanel}
          busy={busy}
          onPanelClick={(id) => {
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
          }}
          recs={recs}
          recCat={cat}
          setRecCat={setCat}
          skipped={skipped}
          onSkip={skip}
          onAddCard={addCard}
          combos={combos}
          comp={comp}
          budgetSwaps={budgetSwaps}
          onSwapCard={swapCard}
          cuts={cuts}
          onRemoveCard={removeCard}
          upgrades={upgrades}
          upgradeMode={upgradeMode}
          setUpgradeMode={setUpgradeMode}
          commander={commander}
          format={format}
          strategy={strategy}
          strategyLoading={strategyLoading}
          serverWarmed={serverWarmed}
        />
      </div>

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

      {/* Mobile FAB — scroll to search and focus */}
      {!locked && (
        <button
          className="deck-fab"
          onClick={() => {
            searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            setTimeout(() => searchRef.current?.querySelector("input")?.focus(), 300);
          }}
          aria-label="Add cards"
        >
          +
        </button>
      )}

      {/* Mobile AI FAB */}
      <button
        className="deck-fab-ai"
        onClick={() => setAiSheetOpen(true)}
        aria-label="AI Insights"
      >
        ⚡
      </button>

      {/* Mobile AI Bottom Sheet */}
      {aiSheetOpen && (
        <div className="ai-sheet-backdrop" onClick={() => setAiSheetOpen(false)}>
          <div className="ai-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="ai-sheet-handle" />
            <div className="ai-sheet-header">
              <span style={{ fontWeight: 600, fontSize: ".85rem" }}>AI Insights</span>
              <span className="muted" style={{ fontSize: ".7rem" }}>{deckName || "Untitled deck"}</span>
            </div>
            <div className="ai-sheet-body">
              <DeckSidebar
                result={result}
                isAnalyzing={isAnalyzing}
                activePanel={activePanel}
                busy={busy}
                onPanelClick={(id) => {
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
                }}
                recs={recs}
                recCat={cat}
                setRecCat={setCat}
                skipped={skipped}
                onSkip={skip}
                onAddCard={addCard}
                combos={combos}
                comp={comp}
                budgetSwaps={budgetSwaps}
                onSwapCard={swapCard}
                cuts={cuts}
                onRemoveCard={removeCard}
                upgrades={upgrades}
                upgradeMode={upgradeMode}
                setUpgradeMode={setUpgradeMode}
                commander={commander}
                format={format}
                strategy={strategy}
                strategyLoading={strategyLoading}
                serverWarmed={serverWarmed}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
