import { useState } from "react";
import { api, assembleDecklist, FORMATS } from "../lib/api";
import CardPreview from "./CardPreview";
import CommanderInput from "./CommanderInput";
import LoadingIndicator from "./LoadingIndicator";
import Wizard from "./Wizard";

const hasApiKey = () => Boolean(localStorage.getItem("mtgweb:anthropicKey"));

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

export default function Build({ decklist, setDecklist, format, setFormat, commander, setCommander, aiAvailable: aiProp, onGoAnalyze, onPlaytest, notify }) {
  const [mode, setMode] = useState("manual"); // "manual" | "wizard"
  const [recs, setRecs] = useState(null);
  const [combos, setCombos] = useState(null);
  const [comp, setComp] = useState(null);
  const [cat, setCat] = useState("high_synergy");
  const [busy, setBusy] = useState("");

  // AI results
  const [cuts, setCuts] = useState(null);
  const [fills, setFills] = useState(null);
  const [explanations, setExplanations] = useState(null);
  const [comboGuide, setComboGuide] = useState(null);
  const [budgetSwaps, setBudgetSwaps] = useState(null);
  const [bracket, setBracket] = useState(null);

  // Universal skip tracking — cards dismissed from suggestions
  const [skipped, setSkipped] = useState(new Set());
  function skip(name) { setSkipped((prev) => new Set(prev).add(name)); }
  function isSkipped(name) { return skipped.has(name); }

  // Swap replacement tracking — which replacement index is showing per cut
  const [repIdx, setRepIdx] = useState({});  // cutName -> index into replacements
  const [browsing, setBrowsing] = useState(null);  // cutName or category currently browsing
  function nextRep(cutName, maxLen) {
    setRepIdx((prev) => ({ ...prev, [cutName]: ((prev[cutName] || 0) + 1) % maxLen }));
  }
  function swapCard(oldName, newName) {
    removeCard(oldName);
    addCard(newName);
    skip(oldName);
  }

  const isCommanderFmt = format === "commander" || format === "paupercommander";
  // AI available when the server has a key (prop from App health check) or a personal key is set.
  const aiAvailable = aiProp || hasApiKey();

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

  async function runAiCuts() {
    if (!decklist.trim()) return notify("Paste a list first.");
    setBusy("AI Cuts");
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      const r = await api.aiCuts(full, format, bracket);
      setCuts(r);
      if (r.error) notify(r.message);
    } catch (e) { notify(`AI cuts failed: ${e.message}`); }
    finally { setBusy(""); }
  }

  async function runAiFills() {
    if (!decklist.trim()) return notify("Paste a list first.");
    setBusy("AI Fills");
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      const r = await api.aiFills(full, format, bracket);
      setFills(r);
      if (r.error) notify(r.message);
      else if (r.message) notify(r.message);
    } catch (e) { notify(`AI fills failed: ${e.message}`); }
    finally { setBusy(""); }
  }

  async function runAiExplain() {
    const recList = recs?.categories?.[cat] || [];
    const names = recList.filter((c) => !c.in_deck).slice(0, 10).map((c) => c.name);
    if (!names.length) return notify("No recommendations to explain — run Recommendations first.");
    setBusy("AI Explain");
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      const r = await api.aiExplain(full, format, names, bracket);
      setExplanations(r);
      if (r.error) notify(r.message);
    } catch (e) { notify(`AI explain failed: ${e.message}`); }
    finally { setBusy(""); }
  }

  async function runAiComboGuide() {
    if (!combos) return notify("Run 'Find combos' first.");
    setBusy("AI Combos");
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      const r = await api.aiCombos(full, format, combos.combos || [], combos.near_misses || [], bracket);
      setComboGuide(r);
      if (r.error) notify(r.message);
    } catch (e) { notify(`AI combo guide failed: ${e.message}`); }
    finally { setBusy(""); }
  }

  const recList = recs?.categories?.[cat] || [];
  const explMap = {};
  (explanations?.explanations || []).forEach((e) => { explMap[e.name] = e.explanation; });

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
          {aiAvailable ? " AI features are active — look for the ✨ buttons." : " Add an API key in Settings to unlock AI features."}
        </p>

        <div className="row" style={{ flexWrap: "wrap" }}>
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }}>
            {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          {aiAvailable && (
            <select value={bracket ?? ""} onChange={(e) => setBracket(e.target.value ? Number(e.target.value) : null)} style={{ width: "auto" }}>
              <option value="">Bracket: auto-detect</option>
              <option value="1">Bracket 1 — Precon-level</option>
              <option value="2">Bracket 2 — Focused</option>
              <option value="3">Bracket 3 — Optimized</option>
              <option value="4">Bracket 4 — cEDH</option>
            </select>
          )}
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
          {aiAvailable && (
            <button onClick={runAiCuts} disabled={busy === "AI Cuts"} style={{ borderColor: "var(--accent)" }}>
              {busy === "AI Cuts" ? "Thinking…" : "✨ Suggest cuts"}
            </button>
          )}
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
      <LoadingIndicator label="Analyzing deck for cuts" active={busy === "AI Cuts"} />
      <LoadingIndicator label="Finding fill suggestions" active={busy === "AI Fills"} />
      <LoadingIndicator label="Explaining recommendations" active={busy === "AI Explain"} />
      <LoadingIndicator label="Evaluating combos" active={busy === "AI Combos"} />

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

      {/* AI Suggested Cuts with Swap */}
      {cuts && !cuts.error && cuts.cuts?.filter((c) => !isSkipped(c.name)).length > 0 && (
        <div className="panel">
          <h3>✨ Suggested swaps</h3>
          <p className="muted small">Weakest cards paired with replacement suggestions. Swap, skip the replacement, or browse all alternatives.</p>
          {cuts.cuts.filter((c) => !isSkipped(c.name)).map((c) => {
            const reps = (c.replacements || []).filter((r) => !isSkipped(r.name));
            const idx = (repIdx[c.name] || 0) % Math.max(reps.length, 1);
            const rep = reps[idx];
            return (
              <div key={c.name} style={{ borderTop: "1px solid var(--border)", padding: ".6rem 0" }}>
                <div className="spread">
                  <div style={{ flex: 1 }}>
                    <span style={{ color: "var(--danger, #d9534f)" }}>✕</span>{" "}
                    <CardPreview name={c.name} />
                    <div className="muted small">{c.reason}</div>
                  </div>
                  <button className="ghost small" onClick={() => skip(c.name)}>Skip cut</button>
                </div>
                {rep && (
                  <div className="spread" style={{ marginTop: ".3rem", paddingLeft: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ color: "var(--good, #4caf7d)" }}>→</span>{" "}
                      <CardPreview name={rep.name} />
                      <span className="muted small" style={{ marginLeft: ".3rem" }}>{rep.role}</span>
                    </div>
                    <div className="row" style={{ gap: ".3rem", flexShrink: 0 }}>
                      {reps.length > 1 && (
                        <button className="ghost small" onClick={() => nextRep(c.name, reps.length)}>Next</button>
                      )}
                      <button className="ghost small" onClick={() => setBrowsing(browsing === c.name ? null : c.name)}>
                        {browsing === c.name ? "Close" : "Browse"}
                      </button>
                      <button className="ghost small" onClick={() => swapCard(c.name, rep.name)}
                        style={{ color: "var(--good, #4caf7d)" }}>Swap</button>
                    </div>
                  </div>
                )}
                {/* Browse panel */}
                {browsing === c.name && reps.length > 0 && (
                  <div style={{ marginTop: ".4rem", paddingLeft: "1rem", maxHeight: "200px", overflowY: "auto" }}>
                    {reps.map((r) => (
                      <div key={r.name} className="spread" style={{ padding: ".2rem 0", fontSize: ".85rem" }}>
                        <span><CardPreview name={r.name} /> <span className="muted small">{r.role}</span></span>
                        <button className="ghost small" onClick={() => swapCard(c.name, r.name)}
                          style={{ color: "var(--good, #4caf7d)" }}>Swap</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
          {aiAvailable && comp.categories.some((c) => c.status === "thin") && (
            <div style={{ marginTop: ".6rem" }}>
              <button onClick={runAiFills} disabled={busy === "AI Fills"} style={{ borderColor: "var(--accent)" }}>
                {busy === "AI Fills" ? "Thinking…" : "✨ Suggest fills for thin categories"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Composition Fills */}
      {fills && !fills.error && fills.fills?.length > 0 && (
        <div className="panel">
          <h3>✨ Suggested fills</h3>
          {fills.fills.map((catFill, i) => {
            // Merge AI suggestions + pool, dedup, filter skipped, show 4
            const seen = new Set();
            const allCards = [...(catFill.suggestions || []), ...(catFill.pool || [])].filter((s) => {
              if (seen.has(s.name) || isSkipped(s.name)) return false;
              seen.add(s.name);
              return true;
            });
            if (!allCards.length) return null;
            return (
              <div key={i} style={{ marginBottom: "1rem" }}>
                <strong>{catFill.category}</strong>
                {allCards.slice(0, 4).map((s) => (
                  <div key={s.name} className="spread" style={{ borderTop: "1px solid var(--border)", padding: ".4rem 0" }}>
                    <div style={{ flex: 1 }}>
                      <CardPreview name={s.name} />
                      <div className="muted small">{s.reason}</div>
                    </div>
                    <div className="row" style={{ gap: ".3rem", flexShrink: 0 }}>
                      <button className="ghost small" onClick={() => skip(s.name)}>Skip</button>
                      <button className="ghost small" onClick={() => addCard(s.name)}>+ Add</button>
                    </div>
                  </div>
                ))}
                {allCards.length > 4 && (
                  <div style={{ marginTop: ".3rem" }}>
                    <button className="ghost small" onClick={() => setBrowsing(browsing === `fill-${i}` ? null : `fill-${i}`)}>
                      {browsing === `fill-${i}` ? "Close" : `Browse all ${allCards.length} options`}
                    </button>
                  </div>
                )}
                {browsing === `fill-${i}` && (
                  <div style={{ marginTop: ".3rem", maxHeight: "250px", overflowY: "auto" }}>
                    {allCards.slice(4).map((s) => (
                      <div key={s.name} className="spread" style={{ padding: ".2rem 0", fontSize: ".85rem", borderTop: "1px solid var(--border)" }}>
                        <span><CardPreview name={s.name} /></span>
                        <button className="ghost small" onClick={() => addCard(s.name)}>+ Add</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
          {aiAvailable && (combos.combos?.length > 0 || combos.near_misses?.length > 0) && (
            <div style={{ marginTop: ".6rem" }}>
              <button onClick={runAiComboGuide} disabled={busy === "AI Combos"} style={{ borderColor: "var(--accent)" }}>
                {busy === "AI Combos" ? "Thinking…" : "✨ Which combos should I build toward?"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI Combo Guidance */}
      {comboGuide && !comboGuide.error && (
        <div className="panel">
          <h3>✨ Combo guidance</h3>
          {comboGuide.assessments?.map((a, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--border)", padding: ".5rem 0" }}>
              <span className={`badge ${a.verdict === "BUILD" ? "good" : "warn"}`}>{a.verdict}</span>{" "}
              <strong>{a.combo}</strong>
              <div className="muted small">{a.reason}</div>
            </div>
          ))}
          {comboGuide.new_suggestions?.length > 0 && (
            <>
              <h4 style={{ marginTop: ".8rem" }}>Other combos to consider</h4>
              {comboGuide.new_suggestions.map((s, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--border)", padding: ".5rem 0" }}>
                  <strong>{s.combo}</strong>
                  <div className="muted small">{s.reason}</div>
                </div>
              ))}
            </>
          )}
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
            {aiAvailable && (
              <button onClick={runAiExplain} disabled={busy === "AI Explain"} className="ghost small" style={{ borderColor: "var(--accent)" }}>
                {busy === "AI Explain" ? "Thinking…" : "✨ Explain why these fit"}
              </button>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="results-table">
              <thead><tr><th>Card</th><th>Synergy</th><th>Played in</th><th></th></tr></thead>
              <tbody>
                {recList.filter((c) => !isSkipped(c.name)).map((c, i) => {
                  const pct = c.potential_decks ? Math.round((c.num_decks / c.potential_decks) * 100) : null;
                  return (
                    <tr key={c.name} style={{ opacity: c.in_deck ? 0.45 : 1 }}>
                      <td>
                        <CardPreview name={c.name} />
                        {explMap[c.name] && <div className="muted small" style={{ maxWidth: "300px" }}>{explMap[c.name]}</div>}
                      </td>
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

      {/* No API key hint */}
      {!aiAvailable && (
        <div className="panel" style={{ opacity: 0.7 }}>
          <h3>✨ AI features</h3>
          <p className="muted small">Add your Anthropic API key in Settings to unlock AI-powered suggested cuts, composition fills, recommendation explanations, and combo guidance.</p>
        </div>
      )}
    </div>
  );
}
