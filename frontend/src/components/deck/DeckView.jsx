import { useCallback, useEffect, useRef, useState } from "react";
import { api, assembleDecklist, getCardImage, FORMATS } from "../../lib/api";
import CommanderInput from "../CommanderInput";
import CardPreview from "../CardPreview";
import LoadingIndicator from "../LoadingIndicator";
import Wizard from "../Wizard";
import CardGrid from "./CardGrid";
import DeckInput from "./DeckInput";
import DeckSidebar from "./DeckSidebar";
import MoreMenu from "./MoreMenu";
import DrawProbability from "./DrawProbability";
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

const REC_CATEGORIES = [
  ["high_synergy", "High synergy"],
  ["top_cards", "Top cards"],
  ["creatures", "Creatures"],
  ["instants", "Instants"],
  ["sorceries", "Sorceries"],
  ["artifacts", "Artifacts"],
  ["enchantments", "Enchantments"],
  ["planeswalkers", "Planeswalkers"],
  ["lands", "Lands"],
];

function comboPieces(cards = [], templates = []) {
  const parts = [
    ...cards.map((n) => <CardPreview key={`c-${n}`} name={n} />),
    ...templates.map((t) => <span key={`t-${t.name}`}>{t.name}</span>),
  ];
  return parts.map((el, i) => <span key={i}>{i > 0 && " + "}{el}</span>);
}

export default function DeckView({
  decklist, setDecklist, format, setFormat, commander, setCommander,
  maybeboard, setMaybeboard,
  deckName, onSave, onClone, onExport, onPlaytest, onShare,
  startInWizard, onWizardConsumed, notify,
}) {
  const [mode, setMode] = useState(startInWizard ? "wizard" : "manual");

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
  const [busy, setBusy] = useState("");
  const [cat, setCat] = useState("high_synergy");
  const [activePanel, setActivePanel] = useState(null);
  const [deckFilter, setDeckFilter] = useState("");
  const [skipped, setSkipped] = useState(new Set());
  const [cmdrData, setCmdrData] = useState(null);
  const [maybeOpen, setMaybeOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
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

  const recList = recs?.categories?.[cat] || [];

  const hasCommander = isCommanderFmt && commander;
  const considerCount = parseDeckText(maybeboard || "").cards.length;

  return (
    <div>
      {/* Commander + format bar */}
      <div className="deck-toolbar">
        <div className="deck-toolbar-top">
          <h2 className="deck-title">{deckName || "Untitled deck"}</h2>
          <div className="row" style={{ gap: ".4rem", alignItems: "center" }}>
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }}>
              {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <button onClick={() => setMode("wizard")} className="ghost small" style={{ borderColor: "var(--accent)" }}>
              ✨ Wizard
            </button>
            <button className="ghost small" onClick={() => setMaybeOpen(true)}>
              Considering ({considerCount})
            </button>
            <button className="primary small" onClick={onSave}>Save</button>
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
            <div style={{ textAlign: "center", marginTop: ".5rem" }}>
              <button className="ghost small" onClick={() => setCommander("")} style={{ fontSize: ".75rem" }}>Change commander</button>
            </div>
            {!commander && (
              <CommanderInput commander={commander} setCommander={setCommander} />
            )}
          </div>
        )}

        <div className="deck-main">
          <DeckInput
            decklist={decklist}
            setDecklist={setDecklist}
            addCard={addCard}
            notify={notify}
            filter={deckFilter}
            setFilter={setDeckFilter}
          />
          <CardGrid
            decklist={decklist}
            commander={commander}
            format={format}
            filter={deckFilter}
            onRemove={removeCard}
            notify={notify}
          />

          {/* Expandable panels below card grid */}
          {activePanel === "DrawOdds" && (
            <DrawProbability result={result} commander={commander} format={format} />
          )}
          {activePanel === "Recommendations" && (
            <LoadingIndicator label="Loading recommendations" active={busy === "Recommendations"} />
          )}
          {activePanel === "Combos" && (
            <LoadingIndicator label="Searching combos" active={busy === "Combos"} />
          )}
          {activePanel === "Composition" && (
            <LoadingIndicator label="Checking composition" active={busy === "Composition"} />
          )}
          {activePanel === "Budget" && (
            <LoadingIndicator label="Finding swaps" active={busy === "Budget"} />
          )}

          {/* Budget swaps panel */}
          {budgetSwaps?.swaps && activePanel === "Budget" && (
            <div className="panel">
              <h3>Budget Swaps</h3>
              {budgetSwaps.swaps.length === 0 ? (
                <p className="muted small">Your deck is already budget-friendly!</p>
              ) : (
                <>
                  <p className="muted small">Potential savings: ${budgetSwaps.total_savings?.toFixed(2)}</p>
                  {budgetSwaps.swaps.map((s) => (
                    <div key={s.card} className="spread border-top" style={{ padding: ".4rem 0" }}>
                      <div style={{ flex: 1 }}>
                        <CardPreview name={s.card} /> <span className="muted small">${s.price}</span>
                        <span className="muted" style={{ margin: "0 .4rem" }}>→</span>
                        <CardPreview name={s.alternative.name} /> <span className="muted small">${s.alternative.price}</span>
                        <span className="badge good small" style={{ marginLeft: ".3rem" }}>{s.alternative.role}</span>
                      </div>
                      <button className="ghost small btn-good" onClick={() => swapCard(s.card, s.alternative.name)}>Swap</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Composition panel */}
          {comp && activePanel === "Composition" && (
            <div className="panel">
              <h3>Composition</h3>
              {comp.is_commander && <p className="muted small">Targets are Commander rules-of-thumb.</p>}
              <div className="stat-grid">
                {comp.categories.map((c) => (
                  <div className="stat" key={c.key}>
                    <div className="k">{c.label}{c.status === "thin" && <span className="badge bad" style={{ marginLeft: ".3rem" }}>thin</span>}</div>
                    <div className="v">{c.count}{c.target ? <span className="muted small"> / {c.target}</span> : null}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Combos panel */}
          {combos && activePanel === "Combos" && (
            <div className="panel">
              <h3>Combos</h3>
              {combos.combos?.length === 0 && combos.near_misses?.length === 0 && (
                <p className="muted small">No combos or near-misses found.</p>
              )}
              {combos.combos?.map((c, i) => (
                <div key={i} className="border-top" style={{ padding: ".5rem 0" }}>
                  <span className="badge good">combo</span> {comboPieces(c.cards, c.templates)}
                </div>
              ))}
              {combos.near_misses?.map((c, i) => (
                <div key={i} className="spread border-top" style={{ padding: ".5rem 0" }}>
                  <div>
                    <span className="badge warn">1 away</span>{" "}
                    {c.missing_card ? <CardPreview name={c.missing_card} /> : <strong>{c.missing_template}</strong>}
                    <div className="muted small">completes: {comboPieces(c.cards, c.templates)}</div>
                  </div>
                  {c.missing_card && <button className="ghost small" onClick={() => addCard(c.missing_card)}>+ Add</button>}
                </div>
              ))}
            </div>
          )}

          {/* Recommendations panel */}
          {recs?.categories && activePanel === "Recommendations" && Object.keys(recs.categories).length > 0 && (
            <div className="panel">
              <h3>Recommended for {recs.commanders?.join(" + ")}</h3>
              <div className="row" style={{ margin: ".4rem 0", flexWrap: "wrap" }}>
                <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: "auto" }}>
                  {REC_CATEGORIES.filter(([k]) => recs.categories[k]?.length).map(([k, label]) => (
                    <option key={k} value={k}>{label} ({recs.categories[k].length})</option>
                  ))}
                </select>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="results-table">
                  <thead><tr><th>Card</th><th>Synergy</th><th>Played in</th><th></th></tr></thead>
                  <tbody>
                    {recList.filter((c) => !skipped.has(c.name)).map((c) => {
                      const pct = c.potential_decks ? Math.round((c.num_decks / c.potential_decks) * 100) : null;
                      return (
                        <tr key={c.name} style={{ opacity: c.in_deck ? 0.45 : 1 }}>
                          <td><CardPreview name={c.name} /></td>
                          <td>{c.synergy != null ? `${(c.synergy * 100).toFixed(0)}%` : "—"}</td>
                          <td className="muted">{pct != null ? `${pct}%` : "—"}</td>
                          <td>
                            {!c.in_deck && (
                              <div className="row" style={{ gap: ".2rem" }}>
                                <button className="ghost small" onClick={() => skip(c.name)}>Skip</button>
                                <button className="ghost small" onClick={() => addCard(c.name)}>+ Add</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <DeckSidebar
          result={result}
          isAnalyzing={isAnalyzing}
          activePanel={activePanel}
          busy={busy}
          onPanelClick={(id) => {
            if (activePanel === id) { setActivePanel(null); return; }
            if (id === "DrawOdds") { setActivePanel("DrawOdds"); return; }
            const map = {
              Recommendations: [api.recommend, setRecs],
              Combos: [api.combos, setCombos],
              Composition: [api.composition, setComp],
              Budget: [api.budgetSwaps, setBudgetSwaps],
            };
            if (map[id]) loadPanel(id, ...map[id]);
          }}
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
    </div>
  );
}
