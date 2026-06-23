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
  deckName, onSave, onClone, onExport, onPlaytest, onShare, notify,
}) {
  const [mode, setMode] = useState("manual");
  const [result, setResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recs, setRecs] = useState(null);
  const [combos, setCombos] = useState(null);
  const [comp, setComp] = useState(null);
  const [budgetSwaps, setBudgetSwaps] = useState(null);
  const [busy, setBusy] = useState("");
  const [cat, setCat] = useState("high_synergy");
  const [activePanel, setActivePanel] = useState(null);
  const [skipped, setSkipped] = useState(new Set());
  const [cmdrData, setCmdrData] = useState(null);
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
            <div className="cmdr-col-type">{cmdrData?.type_line || ""}</div>
            <div className="cmdr-col-badges">
              {(cmdrData?.color_identity || []).map((c) => (
                <span key={c} className={`pip pip-${c}`}>{c}</span>
              ))}
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
          />
          <CardGrid
            decklist={decklist}
            commander={commander}
            format={format}
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
          onAnalyze={analyze}
          onRecommendations={() => loadPanel("Recommendations", api.recommend, setRecs)}
          onCombos={() => loadPanel("Combos", api.combos, setCombos)}
          onBudgetSwaps={() => loadPanel("Budget", api.budgetSwaps, setBudgetSwaps)}
          onComposition={() => loadPanel("Composition", api.composition, setComp)}
          onDrawOdds={() => setActivePanel(activePanel === "DrawOdds" ? null : "DrawOdds")}
        />
      </div>
    </div>
  );
}
