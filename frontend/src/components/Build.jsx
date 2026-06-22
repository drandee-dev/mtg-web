import { useState } from "react";
import { api, assembleDecklist, FORMATS } from "../lib/api";
import CardPreview from "./CardPreview";
import CommanderInput from "./CommanderInput";
import LoadingIndicator from "./LoadingIndicator";
import Wizard from "./Wizard";

function comboPieces(cards = [], templates = []) {
  const parts = [
    ...cards.map((n) => <CardPreview key={`c-${n}`} name={n} />),
    ...templates.map((t) => <span key={`t-${t.name}`}>{t.name}</span>),
  ];
  return parts.map((el, i) => (
    <span key={i}>{i > 0 && " + "}{el}</span>
  ));
}

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

const countCards = (txt) =>
  (txt || "")
    .split("\n")
    .filter((l) => /^\s*\d+\s+\S/.test(l))
    .reduce((n, l) => n + (parseInt(l, 10) || 1), 0);

export default function Build({ decklist, setDecklist, format, setFormat, commander, setCommander, onGoAnalyze, onPlaytest, notify }) {
  const [mode, setMode] = useState("manual"); // "manual" | "wizard"
  const [recs, setRecs] = useState(null);
  const [combos, setCombos] = useState(null);
  const [comp, setComp] = useState(null);
  const [cat, setCat] = useState("high_synergy");
  const [busy, setBusy] = useState("");
  const [budgetSwaps, setBudgetSwaps] = useState(null);

  // Universal skip tracking — cards dismissed from suggestions
  const [skipped, setSkipped] = useState(new Set());
  function skip(name) { setSkipped((prev) => new Set(prev).add(name)); }
  function isSkipped(name) { return skipped.has(name); }

  // Swap replacement tracking
  const [browsing, setBrowsing] = useState(null);
  function swapCard(oldName, newName) {
    removeCard(oldName);
    addCard(newName);
    skip(oldName);
  }

  const isCommanderFmt = format === "commander" || format === "paupercommander";

  function handleWizardFinish(dl, cmd) {
    setDecklist(dl.split("\n").filter((l) => !/^\s*(Commander|Deck)\s*$/i.test(l)).join("\n"));
    setCommander(cmd);
    setMode("manual");
    notify("Deck loaded from wizard — tune it here.");
  }

  if (mode === "wizard") {
    return (
      <div>
        <div className="panel">
          <div className="spread">
            <span />
            <button className="ghost small" onClick={() => setMode("manual")}>← Back to manual builder</button>
          </div>
        </div>
        <Wizard onFinish={handleWizardFinish} notify={notify} />
      </div>
    );
  }

  function addCard(name) {
    setDecklist((prev) => `${prev.replace(/\s*$/, "")}\n1 ${name}`);
    notify(`Added ${name}`);
  }

  function removeCard(name) {
    setDecklist((prev) => {
      const lines = prev.split("\n");
      const idx = lines.findIndex((l) => l.match(new RegExp(`^\\s*\\d+\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i")));
      if (idx >= 0) lines.splice(idx, 1);
      return lines.join("\n");
    });
    notify(`Removed ${name}`);
  }

  async function run(kind, fn, setter) {
    if (!decklist.trim()) return notify("Pick a commander or paste a list first.");
    setBusy(kind);
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      const r = await fn(full, format);
      setter(r);
      if (r.note) notify(r.note);
    } catch (e) {
      notify(`${kind} failed: ${e.message}`);
    } finally {
      setBusy("");
    }
  }

  const recList = recs?.categories?.[cat] || [];

  return (
    <div>
      <div className="panel">
        <div className="spread">
          <h2>Guided builder</h2>
          <button onClick={() => setMode("wizard")} style={{ borderColor: "var(--accent)" }}>
            ✨ Deck wizard
          </button>
        </div>
        <p className="muted small">
          Paste an existing list to tune it, or use the <strong>Deck wizard</strong> to build from scratch.
          Use the <strong>⚡ Planeswalker</strong> for tailored advice.
        </p>

        <div className="row" style={{ flexWrap: "wrap" }}>
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }}>
            {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <span className="muted small">{countCards(decklist)} cards in list</span>
        </div>

        {isCommanderFmt && (
          <CommanderInput commander={commander} setCommander={setCommander} />
        )}

        <label htmlFor="builddeck" style={{ marginTop: ".6rem" }}>Your deck</label>
        <textarea id="builddeck" value={decklist} onChange={(e) => setDecklist(e.target.value)}
          placeholder={"Commander\n1 Atraxa, Praetors' Voice\nDeck\n1 Sol Ring\n..."} />

        <div className="row" style={{ marginTop: ".6rem", flexWrap: "wrap" }}>
          <button className="primary" onClick={() => run("Recommendations", api.recommend, setRecs)} disabled={busy === "Recommendations"}>
            {busy === "Recommendations" ? "Loading…" : "Recommendations"}
          </button>
          <button onClick={() => run("Combos", api.combos, setCombos)} disabled={busy === "Combos"}>
            {busy === "Combos" ? "Searching…" : "Find combos"}
          </button>
          <button onClick={() => run("Composition", api.composition, setComp)} disabled={busy === "Composition"}>
            {busy === "Composition" ? "Checking…" : "Check composition"}
          </button>
          {decklist.trim() && onGoAnalyze && (
            <button onClick={onGoAnalyze}>Analyze</button>
          )}
          {decklist.trim() && onPlaytest && (
            <button onClick={onPlaytest}>Playtest</button>
          )}
          {decklist.trim() && (
            <button onClick={async () => { setBusy("Budget"); try { const full = assembleDecklist(decklist, isCommanderFmt ? commander : ""); setBudgetSwaps(await api.budgetSwaps(full, format)); } catch (e) { notify(`Budget swaps failed: ${e.message}`); } finally { setBusy(""); } }} disabled={busy === "Budget"}>
              {busy === "Budget" ? "Checking…" : "Budget swaps"}
            </button>
          )}
        </div>
      </div>

      {/* Loading indicators */}
      <LoadingIndicator label="Loading recommendations" active={busy === "Recommendations"} />
      <LoadingIndicator label="Searching combos" active={busy === "Combos"} />
      <LoadingIndicator label="Checking composition" active={busy === "Composition"} />

      {/* Budget swaps */}
      {budgetSwaps && budgetSwaps.swaps?.length > 0 && (
        <div className="panel">
          <h3>Budget swaps</h3>
          <p className="muted small">Cheaper alternatives for expensive cards. Potential savings: ${budgetSwaps.total_savings?.toFixed(2)}</p>
          {budgetSwaps.swaps.map((s) => (
            <div key={s.card} className="spread" style={{ borderTop: "1px solid var(--border)", padding: ".4rem 0" }}>
              <div style={{ flex: 1 }}>
                <CardPreview name={s.card} /> <span className="muted small">${s.price}</span>
                <span style={{ margin: "0 .4rem", color: "var(--muted)" }}>→</span>
                <CardPreview name={s.alternative.name} /> <span className="muted small">${s.alternative.price}</span>
                <span className="badge good small" style={{ marginLeft: ".3rem" }}>{s.alternative.role}</span>
              </div>
              <button className="ghost small" onClick={() => swapCard(s.card, s.alternative.name)} style={{ color: "var(--good)" }}>Swap</button>
            </div>
          ))}
        </div>
      )}
      {budgetSwaps && budgetSwaps.swaps?.length === 0 && (
        <div className="panel"><p className="muted small">No expensive cards found above the threshold — your deck is already budget-friendly!</p></div>
      )}

      {/* Composition */}
      {comp && (
        <div className="panel">
          <h3>Composition</h3>
          {comp.is_commander && <p className="muted small">Targets are Commander rules-of-thumb. Thin categories are flagged.</p>}
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

      {/* Combos */}
      {combos && (
        <div className="panel">
          <h3>Combos</h3>
          {combos.combos?.length === 0 && combos.near_misses?.length === 0 && <p className="muted small">No combos or near-misses found.</p>}
          {combos.combos?.map((c, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--border)", padding: ".5rem 0" }}>
              <span className="badge good">combo</span>{" "}
              {comboPieces(c.cards, c.templates)}
            </div>
          ))}
          {combos.near_misses?.map((c, i) => (
            <div key={i} className="spread" style={{ borderTop: "1px solid var(--border)", padding: ".5rem 0" }}>
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

      {/* Recommendations */}
      {recs?.categories && Object.keys(recs.categories).length > 0 && (
        <div className="panel">
          <h3>Recommended for {recs.commanders?.join(" + ")}</h3>
          <div className="row" style={{ margin: ".4rem 0", flexWrap: "wrap" }}>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: "auto" }}>
              {REC_CATEGORIES.filter(([k]) => recs.categories[k]?.length).map(([k, label]) => (
                <option key={k} value={k}>{label} ({recs.categories[k].length})</option>
              ))}
            </select>
            <span className="muted small">In-deck cards are dimmed.</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="results-table">
              <thead><tr><th>Card</th><th>Synergy</th><th>Played in</th><th></th></tr></thead>
              <tbody>
                {recList.filter((c) => !isSkipped(c.name)).map((c) => {
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
  );
}
