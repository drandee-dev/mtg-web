import { useState } from "react";
import { api, FORMATS } from "../lib/api";
import CardPreview from "./CardPreview";
import CommanderInput from "./CommanderInput";

const CAT_ORDER = [
  ["staples", "Format staples"],
  ["suggested_lands", "Mana base"],
  ["high_synergy", "High synergy"],
  ["top_cards", "Top cards"],
  ["creatures", "Creatures"],
  ["instants", "Instants"],
  ["sorceries", "Sorceries"],
  ["artifacts", "Artifacts"],
  ["enchantments", "Enchantments"],
  ["lands", "Utility lands"],
];

function groupByType(picked) {
  const groups = {};
  Object.keys(picked).forEach((name) => {
    const type = picked[name]?.category || "Other";
    (groups[type] ??= []).push(name);
  });
  return groups;
}

function countRoles(picked) {
  const counts = {};
  Object.values(picked).forEach((info) => {
    (info?.roles || []).forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  });
  return counts;
}

const ROLE_COLORS = {
  Draw: "#6ea8fe", Removal: "#d9534f", "Board wipe": "#d9534f",
  Ramp: "#46b06f", Counter: "#4a90d9", Protection: "#e9e3c0",
  Tutor: "#9a86b8", Recursion: "#9a86b8", Sacrifice: "#9a86b8",
  Mutate: "#c98a3a", "Graveyard fill": "#9a86b8", Tokens: "#46b06f",
  Land: "#9aa3b2", Creature: "#9aa3b2", Lifegain: "#4caf7d",
};

function RoleBadges({ roles }) {
  if (!roles?.length) return null;
  return (
    <span style={{ marginLeft: ".3rem" }}>
      {roles.map((r) => (
        <span key={r} className="badge" style={{
          fontSize: ".65rem", padding: "0 .3rem", marginLeft: ".15rem",
          background: (ROLE_COLORS[r] || "#9aa3b2") + "22",
          color: ROLE_COLORS[r] || "#9aa3b2",
          border: `1px solid ${ROLE_COLORS[r] || "#9aa3b2"}44`,
        }}>{r}</span>
      ))}
    </span>
  );
}

export default function Wizard({ onFinish, notify }) {
  const [phase, setPhase] = useState("setup"); // setup | building | review
  const [commander, setCommander] = useState("");
  const [format, setFormat] = useState("commander");
  const [bracket, setBracket] = useState(null);
  const [skeleton, setSkeleton] = useState(null);
  const [picked, setPicked] = useState({}); // name -> {category, roles}
  const [catIdx, setCatIdx] = useState(0);
  const [busy, setBusy] = useState("");
  const [viewTab, setViewTab] = useState("suggest"); // suggest | deck (mobile toggle)

  const pickedCount = Object.keys(picked).length;
  const cmdCount = (commander || "").split(" && ").filter(Boolean).length;
  const remaining = (100 - cmdCount) - pickedCount;

  const availableCats = CAT_ORDER.filter(([key]) => skeleton?.skeleton?.[key]?.length);
  const currentCat = availableCats[catIdx];
  const currentCards = currentCat ? (skeleton.skeleton[currentCat[0]] || []) : [];
  const isLastCat = catIdx >= availableCats.length - 1;

  async function loadSkeleton() {
    if (!commander) return notify("Pick a commander first.");
    setBusy("skeleton");
    try {
      const primaryCmd = commander.split(" && ")[0];
      const r = await api.wizardSkeleton(primaryCmd, format, bracket);
      if (r.error) return notify(r.message);
      setSkeleton(r);
      const auto = {};
      (r.skeleton?.staples || []).forEach((c) => { auto[c.name] = { category: "Staple", roles: c.roles || [] }; });
      (r.skeleton?.suggested_lands || []).forEach((c) => { auto[c.name] = { category: "Land", roles: c.roles || [] }; });
      setPicked(auto);
      setCatIdx(0);
      setPhase("building");
    } catch (e) { notify(`Failed: ${e.message}`); }
    finally { setBusy(""); }
  }

  function toggleCard(name, typeBucket, roles) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[name]) delete next[name];
      else next[name] = { category: typeBucket || "Other", roles: roles || [] };
      return next;
    });
  }

  function addAll() {
    if (!currentCat) return;
    const label = currentCat[1];
    setPicked((prev) => {
      const next = { ...prev };
      currentCards.forEach((c) => {
        if (!next[c.name]) next[c.name] = { category: label, roles: c.roles || [] };
      });
      return next;
    });
  }

  function removeCard(name) {
    setPicked((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function nextCat() {
    if (isLastCat) setPhase("review");
    else setCatIdx((i) => i + 1);
  }

  function buildDecklist() {
    const cmds = commander.split(" && ").filter(Boolean);
    const lines = ["Commander", ...cmds.map((c) => `1 ${c}`), "Deck"];
    Object.keys(picked).forEach((name) => lines.push(`1 ${name}`));
    return lines.join("\n");
  }

  function finishWizard() {
    onFinish(buildDecklist(), commander);
  }

  // --- SETUP PHASE ---
  if (phase === "setup") {
    return (
      <div className="panel">
        <h2>✨ Deck wizard</h2>
        <p className="muted small">Pick your commander and we'll build a deck skeleton from EDHREC data and format staples, one category at a time.</p>

        <div className="row" style={{ flexWrap: "wrap", marginBottom: ".6rem" }}>
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }}>
            {FORMATS.filter(([v]) => v === "commander" || v === "paupercommander").map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <select value={bracket ?? ""} onChange={(e) => setBracket(e.target.value ? Number(e.target.value) : null)} style={{ width: "auto" }}>
            <option value="">Bracket: auto</option>
            <option value="1">Bracket 1 — Precon</option>
            <option value="2">Bracket 2 — Focused</option>
            <option value="3">Bracket 3 — Optimized</option>
            <option value="4">Bracket 4 — cEDH</option>
          </select>
        </div>

        <CommanderInput commander={commander} setCommander={setCommander} />

        <div style={{ marginTop: ".8rem" }}>
          <button className="primary" onClick={loadSkeleton} disabled={!commander || !!busy}>
            {busy === "skeleton" ? "Building skeleton…" : "Build skeleton →"}
          </button>
        </div>
      </div>
    );
  }

  // --- REVIEW PHASE ---
  if (phase === "review") {
    const groups = groupByType(picked);
    return (
      <div>
        <div className="panel">
          <h2>Review: {skeleton?.commander?.name}</h2>
          <p className="muted small">
            {pickedCount + 1} cards (including commander).
            {remaining > 0 && ` Need ${remaining} more for 100. You can add more from the Build tab after finishing.`}
            {remaining <= 0 && " Deck is at 100 cards!"}
          </p>
        </div>

        <div className="panel">
          {Object.entries(groups).map(([type, names]) => (
            <div key={type} style={{ marginBottom: ".6rem" }}>
              <strong>{type}</strong> <span className="muted small">({names.length})</span>
              {names.map((n) => (
                <div key={n} className="spread" style={{ borderTop: "1px solid var(--border)", padding: ".3rem 0" }}>
                  <CardPreview name={n} />
                  <button className="ghost small" onClick={() => removeCard(n)} style={{ color: "var(--danger, #d9534f)" }}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="row">
            <button onClick={() => { setCatIdx(0); setPhase("building"); }}>← Back to suggestions</button>
            <button className="primary" onClick={finishWizard}>Send to Build tab →</button>
          </div>
        </div>
      </div>
    );
  }

  // --- BUILDING PHASE (split view) ---
  const groups = groupByType(picked);
  const catLabel = currentCat ? currentCat[1] : "";
  const catKey = currentCat ? currentCat[0] : "";

  const suggestionsPane = (
    <div>
      {/* Category header + progress */}
      <div className="panel">
        <div className="spread">
          <div>
            <span className="muted small">Step {catIdx + 1}/{availableCats.length}</span>
            <h3 style={{ margin: 0 }}>{catLabel}</h3>
          </div>
          <span className="badge">{pickedCount}/99 picked</span>
        </div>

        <div className="row" style={{ marginTop: ".6rem" }}>
          <button className="primary" onClick={addAll}>Add all ({currentCards.filter((c) => !picked[c.name]).length})</button>
          <button onClick={nextCat}>{isLastCat ? "Review deck →" : `Skip to next →`}</button>
        </div>
      </div>

      {/* Cards in this category */}
      <div className="panel">
        {currentCards.map((c) => {
          const isPicked = !!picked[c.name];
          const synPct = c.synergy != null ? `${(c.synergy * 100).toFixed(0)}% syn` : null;
          const playPct = c.potential_decks ? `${Math.round((c.num_decks / c.potential_decks) * 100)}% play` : null;
          return (
            <div key={c.name} className="spread" style={{
              borderTop: "1px solid var(--border)", padding: ".4rem 0",
              opacity: isPicked ? 0.5 : 1,
            }}>
              <div>
                <CardPreview name={c.name} />
                <RoleBadges roles={c.roles} />
                {(synPct || playPct || c.reason) && (
                  <span className="muted small" style={{ marginLeft: ".3rem" }}>
                    {[synPct, playPct, c.reason].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <button className={`ghost small`} onClick={() => toggleCard(c.name, catLabel, c.roles)}>
                {isPicked ? "✕ Remove" : "+ Add"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="panel">
        <div className="row">
          {catIdx > 0 && <button onClick={() => setCatIdx((i) => i - 1)}>← Previous</button>}
          <button onClick={nextCat}>{isLastCat ? "Review deck →" : `Next: ${(availableCats[catIdx + 1] || [])[1] || ""} →`}</button>
        </div>
      </div>
    </div>
  );

  const roleCounts = countRoles(picked);
  const deckPane = (
    <div className="panel" style={{ maxHeight: "70vh", overflowY: "auto" }}>
      <div className="spread">
        <h3>Your deck ({pickedCount})</h3>
        <span className="muted small">{remaining > 0 ? `${remaining} more needed` : "Full!"}</span>
      </div>

      {/* Role summary bar */}
      {Object.keys(roleCounts).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".25rem", margin: ".4rem 0" }}>
          {Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
            <span key={role} className="badge" style={{
              fontSize: ".65rem", padding: "0 .3rem",
              background: (ROLE_COLORS[role] || "#9aa3b2") + "22",
              color: ROLE_COLORS[role] || "#9aa3b2",
              border: `1px solid ${ROLE_COLORS[role] || "#9aa3b2"}44`,
            }}>{role}: {count}</span>
          ))}
        </div>
      )}

      {pickedCount === 0 && <p className="muted small">No cards picked yet.</p>}
      {Object.entries(groups).map(([type, names]) => (
        <div key={type} style={{ marginBottom: ".5rem" }}>
          <strong className="small">{type}</strong> <span className="muted small">({names.length})</span>
          {names.map((n) => (
            <div key={n} className="spread" style={{ padding: ".2rem 0", fontSize: ".85rem" }}>
              <span>
                <CardPreview name={n} />
                <RoleBadges roles={picked[n]?.roles} />
              </span>
              <button className="ghost small" onClick={() => removeCard(n)} style={{ color: "var(--danger, #d9534f)", padding: "0 .3rem" }}>✕</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {/* Commander banner */}
      <div className="panel">
        <div className="spread">
          <div>
            <span className="muted small">Building for</span>
            <h3 style={{ margin: 0 }}>{skeleton?.commander?.name}</h3>
          </div>
          <button className="ghost small" onClick={() => setPhase("setup")}>Change commander</button>
        </div>
      </div>

      {/* Mobile tab toggle */}
      <div className="row" style={{ marginBottom: ".5rem" }}>
        <button className={viewTab === "suggest" ? "primary" : ""} onClick={() => setViewTab("suggest")}
          style={{ flex: 1 }}>Suggestions</button>
        <button className={viewTab === "deck" ? "primary" : ""} onClick={() => setViewTab("deck")}
          style={{ flex: 1 }}>My deck ({pickedCount})</button>
      </div>

      {/* Desktop: side by side. Mobile: tab toggle */}
      <div className="wizard-split">
        <div className="wizard-left" style={{ display: viewTab === "suggest" ? "block" : "" }}>
          {suggestionsPane}
        </div>
        <div className="wizard-right" style={{ display: viewTab === "deck" ? "block" : "" }}>
          {deckPane}
        </div>
      </div>
    </div>
  );
}
