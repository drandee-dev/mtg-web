import { useRef, useState } from "react";
import { api, FORMATS } from "../lib/api";
import { parseNarration } from "../lib/buildNotes";
import CardPreview from "./CardPreview";
import LoadingIndicator from "./LoadingIndicator";
import Wizard from "./Wizard";

// The entry screen into deck building. Four labelled routes on one page
// instead of a form that assumes a commander is already chosen. Two of them
// ("Describe what you like", "I know my commander") run the one-shot
// generator below; "Guide me step by step" hands off to the existing
// category-fill Wizard; the collection route is reserved and not wired up.

const BRANCHES = {
  describe: {
    label: "Describe what you like",
    desc: "In your own words. “I love vampires”, “goad my opponents”, “steal everything”. The copilot picks a commander and builds the whole deck around it.",
    badge: "Uses AI",
    tone: "accent",
    steps: ["Choose a path", "Describe your deck", "Pick the commander", "Review the deck"],
  },
  guided: {
    label: "Guide me step by step",
    desc: "One category at a time, with you choosing every card. Runs on EDHREC data and format staples, no model calls.",
    badge: "No AI",
    tone: "plain",
    steps: ["Choose a path", "Pick a commander", "Fill each category"],
  },
  commander: {
    label: "I know my commander",
    desc: "Search a legend and get the 99 around it. Partners and backgrounds pair automatically.",
    badge: "No AI",
    tone: "plain",
    steps: ["Choose a path", "Pick a commander", "Review the deck"],
  },
  collection: {
    label: "Build from my collection",
    desc: "Reads your collection.csv, builds the best deck from cards you already own, and prices only the gaps.",
    badge: "New",
    tone: "good",
    steps: ["Choose a path", "Build from what you own"],
  },
};

const DOOR_ORDER = ["describe", "guided", "commander", "collection"];

// Skeleton categories that supply the non-land half of the deck, in the order
// they get drawn from.
const SPELL_CATS = [
  ["staples", "Format staples"],
  ["high_synergy", "High synergy"],
  ["top_cards", "Top cards"],
  ["creatures", "Creatures"],
  ["instants", "Instants"],
  ["sorceries", "Sorceries"],
  ["artifacts", "Artifacts"],
  ["enchantments", "Enchantments"],
];

const BASIC_FOR = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const BASIC_NAMES = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);
const LAND_TARGET = 36;

function synergyReason(c) {
  if (c.reason) return `EDHREC: ${c.reason}`;
  if (c.synergy != null) return `${Math.round(c.synergy * 100)}% synergy in decks with this commander.`;
  return null;
}

/** Turn a wizard/skeleton response into a legal 100-card list.
 *  Returns { cards: [{name, qty, category, reason}], basics: Map(name→qty) }. */
function assembleSkeleton(skeleton, commanderNames) {
  const seen = new Set(commanderNames.map((n) => n.toLowerCase()));
  const spells = [];
  for (const [key, label] of SPELL_CATS) {
    for (const c of skeleton?.[key] || []) {
      const name = c.name;
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      spells.push({ name, qty: 1, category: label, reason: synergyReason(c) });
    }
  }

  const utilLands = [];
  for (const c of [...(skeleton?.suggested_lands || []), ...(skeleton?.lands || [])]) {
    const name = c.name;
    if (!name || BASIC_NAMES.has(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    utilLands.push({ name, qty: 1, category: "Lands", reason: synergyReason(c) });
    if (utilLands.length >= 8) break;
  }

  const slots = 100 - commanderNames.length;
  const chosenSpells = spells.slice(0, slots - LAND_TARGET);
  // A thin skeleton leaves spell slots empty; they become basics for now and
  // ai/fills replaces them with real cards in the next step.
  const landSlots = slots - chosenSpells.length - utilLands.length;

  const basicNames = (skeleton?._colors || []).map((c) => BASIC_FOR[c]).filter(Boolean);
  const basics = new Map();
  if (landSlots > 0) {
    if (!basicNames.length) basics.set("Wastes", landSlots);
    else {
      for (let i = 0; i < landSlots; i++) {
        const n = basicNames[i % basicNames.length];
        basics.set(n, (basics.get(n) || 0) + 1);
      }
    }
  }
  return { cards: [...chosenSpells, ...utilLands], basics };
}

function toLines(cards, basics) {
  return [
    ...cards.map((c) => `${c.qty} ${c.name}`),
    ...[...basics.entries()].map(([n, q]) => `${q} ${n}`),
  ].join("\n");
}

export default function DeckGenerator({ onFinish, notify }) {
  const [branch, setBranch] = useState(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [format, setFormat] = useState("commander");
  const [bracket, setBracket] = useState(null);

  const [describeText, setDescribeText] = useState("");
  const [candidates, setCandidates] = useState(null); // null | [] | [{name,...}]
  const [searching, setSearching] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const searchDebounce = useRef(null);
  const searchSeq = useRef(0);

  const [progress, setProgress] = useState(null); // null | {label, pct}
  const [built, setBuilt] = useState(null); // {commander, cards, basics, notes}

  const steps = branch ? BRANCHES[branch].steps : null;
  const stepCount = steps?.length ?? null;
  const pct = stepCount ? Math.round((stepIdx / (stepCount - 1)) * 100) : 0;

  function pickBranch(id) {
    setBranch(id);
    setStepIdx(1);
    setCandidates(null);
    setBuilt(null);
  }

  function back() {
    if (stepIdx <= 1) { setBranch(null); setStepIdx(0); return; }
    setStepIdx((i) => i - 1);
  }

  // --- Describe → commander ------------------------------------------------
  // One model call to name a commander, then the real commander endpoint to
  // verify it exists (and to offer alternatives). If the model is unavailable
  // the text itself becomes a plain name search, which still gets somewhere.
  async function resolveFromDescription() {
    const text = describeText.trim();
    if (text.length < 3) return notify?.("Describe the deck in a few words first.");
    setSearching(true);
    try {
      let name = "";
      try {
        const prompt =
          "Name exactly one legendary creature that is legal as a Commander and best matches the " +
          "request below. Reply with ONLY the card name — no punctuation, no explanation.\n" +
          `<user_input>${text.slice(0, 400)}</user_input>`;
        const r = await api.planeswalkerChat([{ role: "user", content: prompt }], "", format, "");
        name = (r?.response || "").trim().split("\n")[0].replace(/^["'*\s]+|["'*.\s]+$/g, "").slice(0, 80);
      } catch { /* fall through to a plain name search */ }
      const r = await api.commanders(name || text.slice(0, 60));
      const results = r.results || [];
      setCandidates(results);
      if (!results.length) notify?.("No commander matched that — try different words.");
      else setStepIdx(2);
    } catch (e) {
      notify?.(`Couldn't find a commander: ${e.message}`);
    } finally {
      setSearching(false);
    }
  }

  // Debounced, same 250ms the other typeaheads use, with a sequence guard so a
  // slow early response can't overwrite a newer one.
  function searchCommanders(q) {
    clearTimeout(searchDebounce.current);
    const query = q.trim();
    if (query.length < 2) { setCandidates(null); setSearching(false); return; }
    setSearching(true);
    searchDebounce.current = setTimeout(async () => {
      const mine = ++searchSeq.current;
      try {
        const r = await api.commanders(query);
        if (mine !== searchSeq.current) return;
        setCandidates(r.results || []);
      } catch (e) {
        if (mine !== searchSeq.current) return;
        setCandidates([]);
        notify?.(`Search failed: ${e.message}`);
      } finally {
        if (mine === searchSeq.current) setSearching(false);
      }
    }, 250);
  }

  // --- One-shot generate ---------------------------------------------------
  async function generate(commanderName) {
    const cmdNames = [commanderName];
    setProgress({ label: "Building the skeleton", pct: 15 });
    try {
      const sk = await api.wizardSkeleton(commanderName, format, bracket);
      if (sk?.error) throw new Error(sk.message || "Commander not found.");
      const colors = sk.commander?.color_identity || [];
      const { cards, basics } = assembleSkeleton({ ...sk.skeleton, _colors: colors }, cmdNames);
      if (!cards.length) throw new Error("No suggestions came back for that commander.");

      const notes = {};
      for (const c of cards) if (c.reason) notes[c.name] = c.reason;

      const header = `Commander\n${cmdNames.map((n) => `1 ${n}`).join("\n")}\nDeck\n`;
      let full = header + toLines(cards, basics);

      // Per-category reasoning. Best-effort: a deck with EDHREC reasons only
      // is still a deck, so a failed or unavailable model never blocks the build.
      setProgress({ label: "Writing the reasoning", pct: 45 });
      const byCat = new Map();
      for (const c of cards) {
        if (!byCat.has(c.category)) byCat.set(c.category, []);
        byCat.get(c.category).push(c.name);
      }
      const narrations = await Promise.allSettled(
        [...byCat.entries()].map(([label, names]) =>
          api.wizardNarrate(commanderName, label, names.slice(0, 10), full)
            .then((r) => (r?.error ? {} : parseNarration(r?.narration, names))),
        ),
      );
      for (const n of narrations) {
        if (n.status === "fulfilled") Object.assign(notes, n.value);
      }

      // Close whatever composition gaps the deck still reports, trading basic
      // lands for the filled cards so the count stays at 100.
      setProgress({ label: "Closing category gaps", pct: 80 });
      const nextBasics = new Map(basics);
      const added = [];
      try {
        const fills = await api.aiFills(full, format, bracket);
        const have = new Set([...cards.map((c) => c.name.toLowerCase()), ...cmdNames.map((n) => n.toLowerCase())]);
        const proposed = (fills?.fills || []).flatMap((f) =>
          (f.suggestions || []).map((s) => ({ ...s, category: f.category || "Fills" })),
        );
        for (const s of proposed) {
          const name = s.name;
          if (!name || have.has(name.toLowerCase())) continue;
          // Only trade away a basic we can spare — otherwise the count drifts.
          const donor = [...nextBasics.entries()].find(([, q]) => q > 0);
          if (!donor) break;
          nextBasics.set(donor[0], donor[1] - 1);
          if (nextBasics.get(donor[0]) === 0) nextBasics.delete(donor[0]);
          have.add(name.toLowerCase());
          added.push({ name, qty: 1, category: s.category, reason: s.reason || null });
          if (s.reason) notes[name] = s.reason;
        }
      } catch { /* fills are optional — the skeleton deck stands on its own */ }

      const finalCards = [...cards, ...added];
      full = header + toLines(finalCards, nextBasics);
      setProgress({ label: "Done", pct: 100 });
      setBuilt({ commander: commanderName, cards: finalCards, basics: nextBasics, notes, decklist: full });
      setStepIdx(steps.length - 1);
    } catch (e) {
      notify?.(`Build failed: ${e.message}`);
    } finally {
      setProgress(null);
    }
  }

  function finish() {
    onFinish(built.decklist, built.commander, built.notes);
  }

  /* ── Guided branch: the existing category-fill wizard, unchanged ───────── */
  if (branch === "guided") {
    return (
      <div className="gen">
        <GenHeader steps={steps} stepIdx={1} pct={pct} onBack={back} />
        <Wizard onFinish={onFinish} notify={notify} />
      </div>
    );
  }

  /* ── Door selection ───────────────────────────────────────────────────── */
  if (!branch) {
    return (
      <div className="gen">
        <div className="gen-hero">
          <h1 className="gen-title">Generate a deck</h1>
          <p className="gen-sub">
            Tell it what you like, or name the commander you already have in mind.
            You get a full deck back with a reason on the cards.
          </p>
        </div>
        <div className="gen-progress" aria-hidden="true">
          <div className="gen-progress-row">
            <span className="gen-step">Step 1</span>
            <span className="gen-pct">0%</span>
          </div>
          <div className="gen-track"><div className="gen-fill" style={{ width: "2%" }} /></div>
        </div>

        <h2 className="gen-h2">How do you want to build?</h2>
        <p className="gen-lede">Four routes into the same deck. Pick the one that matches how much you already know.</p>

        <div className="gen-doors">
          {DOOR_ORDER.map((id) => {
            const b = BRANCHES[id];
            const soon = id === "collection";
            return (
              <button
                key={id}
                type="button"
                className={`gen-door gen-door-${b.tone}`}
                disabled={soon}
                onClick={() => pickBranch(id)}
              >
                <span className="gen-door-txt">
                  <span className="gen-door-t">{b.label}</span>
                  <span className="gen-door-d">{b.desc}</span>
                  {soon && (
                    <span className="gen-door-soon">
                      Not available yet. It needs the collection import, which is not built.
                    </span>
                  )}
                </span>
                <span className={`gen-badge gen-badge-${b.tone}`}>{b.badge}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Review ───────────────────────────────────────────────────────────── */
  if (built) {
    const total = built.cards.reduce((n, c) => n + c.qty, 0)
      + [...built.basics.values()].reduce((n, q) => n + q, 0) + 1;
    const groups = new Map();
    for (const c of built.cards) {
      if (!groups.has(c.category)) groups.set(c.category, []);
      groups.get(c.category).push(c);
    }
    const withReason = built.cards.filter((c) => built.notes[c.name]).length;
    return (
      <div className="gen">
        <GenHeader steps={steps} stepIdx={steps.length - 1} pct={100} onBack={back} />
        <div className="panel">
          <h2 className="gen-h2" style={{ marginTop: 0 }}>{built.commander}</h2>
          <p className="gen-lede gen-summary">
            {total} cards. {withReason} of {built.cards.length} non-basic picks carry a reason.
          </p>
          <div className="row" style={{ gap: ".4rem" }}>
            <button className="primary" onClick={finish}>Open in deck view →</button>
            <button className="ghost" onClick={() => { setBuilt(null); setStepIdx(1); }}>Start over</button>
          </div>
        </div>
        {[...groups.entries()].map(([label, list]) => (
          <div className="panel" key={label}>
            <h3 className="gen-cat">{label} <span className="muted small">({list.length})</span></h3>
            {list.map((c) => (
              <div key={c.name} className="gen-card-row">
                <span className="gen-card-name"><CardPreview name={c.name} /></span>
                {built.notes[c.name] && <span className="gen-card-why">{built.notes[c.name]}</span>}
              </div>
            ))}
          </div>
        ))}
        {built.basics.size > 0 && (
          <div className="panel">
            <h3 className="gen-cat">Basic lands</h3>
            {[...built.basics.entries()].map(([n, q]) => (
              <div key={n} className="gen-card-row">
                <span className="gen-card-name">{q} × {n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Describe / commander input ───────────────────────────────────────── */
  const isDescribe = branch === "describe";
  const onDescribeStep = isDescribe && stepIdx === 1;

  return (
    <div className="gen">
      <GenHeader steps={steps} stepIdx={stepIdx} pct={pct} onBack={back} />

      {progress ? (
        <div className="panel gen-building">
          <LoadingIndicator label={progress.label} active />
          <div className="gen-track"><div className="gen-fill" style={{ width: `${progress.pct}%` }} /></div>
          <p className="gen-lede">{progress.label}…</p>
        </div>
      ) : (
        <div className="panel">
          <div className="row" style={{ flexWrap: "wrap", marginBottom: ".6rem" }}>
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }} aria-label="Format">
              {FORMATS.filter(([v]) => v === "commander" || v === "paupercommander").map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <select value={bracket ?? ""} onChange={(e) => setBracket(e.target.value ? Number(e.target.value) : null)}
              style={{ width: "auto" }} aria-label="Target bracket">
              <option value="">Bracket: auto</option>
              <option value="1">Bracket 1 — Precon</option>
              <option value="2">Bracket 2 — Focused</option>
              <option value="3">Bracket 3 — Optimized</option>
              <option value="4">Bracket 4 — cEDH</option>
            </select>
          </div>

          {onDescribeStep ? (
            <>
              <label htmlFor="gen-describe">What do you want the deck to do?</label>
              <textarea
                id="gen-describe"
                className="gen-describe"
                value={describeText}
                onChange={(e) => setDescribeText(e.target.value.slice(0, 400))}
                placeholder="I want lots of small creatures that all attack at once, and I like sacrificing things."
                rows={4}
              />
              <button className="primary" onClick={resolveFromDescription} disabled={searching}>
                {searching ? "Finding a commander…" : "Find my commander →"}
              </button>
            </>
          ) : (
            <>
              <label htmlFor="gen-cmd">Commander</label>
              <input
                id="gen-cmd"
                value={cmdQuery}
                onChange={(e) => { setCmdQuery(e.target.value); searchCommanders(e.target.value); }}
                placeholder="Start typing… e.g. nethroi"
                autoComplete="off"
              />
              {searching && <p className="muted small">Searching…</p>}
            </>
          )}

          {candidates?.length > 0 && (
            <div className="gen-candidates" role="listbox" aria-label="Commander choices">
              {candidates.slice(0, 8).map((c) => (
                <button key={c.name} role="option" aria-selected="false" className="gen-candidate"
                  onClick={() => generate(c.name)}>
                  <span className="gen-candidate-name">{c.name}</span>
                  <span className="muted small">{c.type_line}</span>
                  <span className="gen-candidate-go">Build the 99 →</span>
                </button>
              ))}
            </div>
          )}
          {candidates?.length === 0 && !searching && (
            <p className="muted small">No commander matched. Try a different name.</p>
          )}
        </div>
      )}
    </div>
  );
}

function GenHeader({ steps, stepIdx, pct, onBack }) {
  return (
    <div className="gen-head">
      <button className="ghost small" onClick={onBack}>← Back</button>
      <div className="gen-progress">
        <div className="gen-progress-row">
          <span className="gen-step">Step {stepIdx + 1} of {steps.length} — {steps[stepIdx]}</span>
          <span className="gen-pct">{pct}%</span>
        </div>
        <div className="gen-track"><div className="gen-fill" style={{ width: `${Math.max(pct, 2)}%` }} /></div>
      </div>
    </div>
  );
}
