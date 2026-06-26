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

const COLOR_COMBO_NAMES = {
  "": "Colorless",
  "W": "Mono-White", "U": "Mono-Blue", "B": "Mono-Black", "R": "Mono-Red", "G": "Mono-Green",
  "WU": "Azorius", "WB": "Orzhov", "WR": "Boros", "WG": "Selesnya",
  "UB": "Dimir", "UR": "Izzet", "UG": "Simic",
  "BR": "Rakdos", "BG": "Golgari",
  "RG": "Gruul",
  "WUB": "Esper", "WUR": "Jeskai", "WUG": "Bant",
  "WBR": "Mardu", "WBG": "Abzan", "WRG": "Naya",
  "UBR": "Grixis", "UBG": "Sultai", "URG": "Temur",
  "BRG": "Jund",
  "WUBR": "Yore-Tiller", "WUBG": "Witch-Maw", "WURG": "Ink-Treader", "WBRG": "Dune-Brood", "UBRG": "Glint-Eye",
  "WUBRG": "5-Color",
};
const WUBRG_ORDER = "WUBRG";
function colorKey(colors) {
  return WUBRG_ORDER.split("").filter((c) => colors.includes(c)).join("");
}
const COLOR_HEX = { W: "#f9faf4", U: "#0e68ab", B: "#150b00", R: "#d3202a", G: "#00733e" };

const BRACKET_LABELS = {
  1: "Precon",
  2: "Core",
  3: "Optimized",
  4: "cEDH",
};

const BRACKET_URL = "https://mtgcommander.net/index.php/the-bracket-system/";

export default function DeckView({
  decklist, setDecklist, format, setFormat, commander, setCommander,
  maybeboard, setMaybeboard,
  deckName, onSave, onClone, onExport, onPlaytest, onShare,
  startInWizard, onWizardConsumed, onBack, notify,
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

  function removeCard(name) {
    setDecklist((prev) => {
      const lines = prev.split("\n");
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const idx = lines.findIndex((l) => new RegExp(`^\\s*\\d+\\s+${esc}\\s*$`, "i").test(l));
      if (idx >= 0) lines.splice(idx, 1);
      return lines.join("\n");
    });
    notify?.(`Removed ${name}`);
  }

  function swapCard(oldName, newName) {
    removeCard(oldName);
    addCard(newName);
    skip(oldName);
  }

  function addToConsidering(name) {
    setMaybeboard?.((prev) => {
      const has = (prev || "").split("\n").some((l) => l.trim().replace(/^\d+\s+/, "").toLowerCase() === name.toLowerCase());
      if (has) return prev;
      return `${(prev || "").replace(/\s*$/, "")}\n1 ${name}`.trim();
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

      {/* Main layout: 3-column when commander is set, 2-column otherwise */}
      <div className={hasCommander ? "deck-layout-3col" : "deck-layout"}>
        {/* Commander left column */}
        {hasCommander && (
          <div className="cmdr-col">
            {cmdrData?.image ? (
              <img className="cmdr-col-card" src={cmdrData.image} alt={commander} loading="lazy" />
            ) : (
              <div className="cmdr-col-card" style={{ aspectRatio: "488/680", background: "var(--panel-2)", borderRadius: "var(--radius-lg)" }} />
            )}
            <div className="cmdr-col-name">{commander.replace(" && ", " + ")}</div>
            <div className="cmdr-col-type">
              {result?.bracket?.bracket != null ? (
                <a href={BRACKET_URL} target="_blank" rel="noopener noreferrer" className="bracket-link">
                  Est. Bracket: {BRACKET_LABELS[result.bracket.bracket] || result.bracket.bracket} ({result.bracket.bracket})
                </a>
              ) : isCommanderFmt ? (
                <span className="muted">Bracket: analyzing…</span>
              ) : null}
            </div>
            <div className="cmdr-col-badges">
              {(() => {
                const ci = cmdrData?.color_identity || [];
                const key = colorKey(ci);
                const name = COLOR_COMBO_NAMES[key];
                const colors = WUBRG_ORDER.split("").filter((c) => ci.includes(c));
                const grad = colors.length >= 2
                  ? `linear-gradient(90deg, ${colors.map((c, i) => `${COLOR_HEX[c]} ${(i / (colors.length - 1)) * 100}%`).join(", ")})`
                  : colors.length === 1 ? COLOR_HEX[colors[0]] : "var(--muted)";
                return (
                  <>
                    <span className="color-swatch" style={{ background: grad }} />
                    {name && <span className="color-combo-name">{name}</span>}
                  </>
                );
              })()}
            </div>
            {/* Mini mana curve */}
            {result?.stats?.curve && (
              <div>
                <div className="cmdr-mini-label">Mana Curve</div>
                <div className="cmdr-mini-curve">
                  {result.stats.curve.map((val, i) => {
                    const max = Math.max(...result.stats.curve, 1);
                    return (
                      <div key={i} className="cmdr-mini-bar">
                        <div className="cmdr-mini-bar-fill" style={{ height: `${(val / max) * 100}%` }} />
                        <span className="cmdr-mini-bar-lbl">{i}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Color demand bars */}
            {result?.mana?.pip_demand_pct && (() => {
              const pct = result.mana.pip_demand_pct;
              const colors = WUBRG_ORDER.split("").filter((c) => pct[c]);
              if (!colors.length) return null;
              return (
                <div>
                  <div className="cmdr-mini-label">Color Demand</div>
                  {colors.map((c) => (
                    <div key={c} className="cmdr-color-row">
                      <span className={`pip pip-${c}`} style={{ width: 14, height: 14, fontSize: ".55rem" }}>{c}</span>
                      <div className="cmdr-color-bar">
                        <div className="cmdr-color-fill" style={{ width: `${pct[c]}%`, background: COLOR_HEX[c] }} />
                      </div>
                      <span className="cmdr-color-pct">{pct[c]}%</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div style={{ textAlign: "center", marginTop: ".5rem" }}>
              <button className="ghost small" onClick={() => setCommander("")} style={{ fontSize: ".75rem" }}>Change commander</button>
            </div>
          </div>
        )}

        <div className="deck-main">
          <DeckInput
            ref={searchRef}
            decklist={decklist}
            setDecklist={setDecklist}
            addCard={addCard}
            notify={notify}
            filter={deckFilter}
            setFilter={setDeckFilter}
            locked={locked}
          />
          <CardGrid
            decklist={decklist}
            commander={commander}
            format={format}
            filter={deckFilter}
            typeFilter={categoryFilter}
            onRemove={locked ? null : removeCard}
            onTypeCounts={setTypeCounts}
            notify={notify}
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
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
