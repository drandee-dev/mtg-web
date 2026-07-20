import { useEffect, useRef, useState } from "react";
import Curve from "../Curve";
import { fmtUsd } from "../../lib/format";
import CardPreview from "../CardPreview";
import LoadingIndicator from "../LoadingIndicator";
import DrawProbability from "./DrawProbability";

// Tabbed insights toolbox — replaces the old Accordion/Feed dual modes.
// One sticky tab strip, one content pane directly beneath it: the active tool
// is always at the top of the panel instead of expanding somewhere down a
// stack of accordions. Analytics is the resting tab (no fetch); the other
// tabs lazy-load through DeckView's onPanelClick state machine.

const WUBRG = ["W", "U", "B", "R", "G", "C"];
const COLOR_NAME = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };

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

const I = (paths) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const TAB_ICONS = {
  Analytics: I(<><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>),
  Recommendations: I(<><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" /></>),
  Cuts: I(<><circle cx="6" cy="6" r="2.6" /><circle cx="6" cy="18" r="2.6" /><path d="M20 4 8.1 15.9" /><path d="M14.5 14.5 20 20" /><path d="M8.1 8.1 12 12" /></>),
  Combos: I(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />),
  Upgrades: I(<><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>),
  DrawOdds: I(<><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.2" /><circle cx="17.5" cy="17.5" r="2.2" /></>),
};

function statusBadge(status) {
  const s = (status || "").toUpperCase();
  if (s === "PASS" || s === "OK") return "good";
  if (s === "WARN") return "warn";
  return "bad";
}

export default function InsightsPanel({
  result, comp, activePanel, onPanelClick, onRefreshPanel, busy, stalePanels,
  recs, recCat, setRecCat, skipped, onSkip, onClearSkipped, onAddCard,
  pinned, onTogglePin,
  cuts, onRemoveCard, dismissedCuts, onDismissCut, onClearDismissedCuts,
  combos, onGoldfish,
  budgetSwaps, upgrades, upgradeMode, setUpgradeMode, onSwapCard,
  commander, format,
}) {
  const active = activePanel || "Analytics";
  const rootRef = useRef(null);
  const mounted = useRef(false);

  // Pull the panel to the top of the sidebar scroll whenever the user picks a
  // tool — results should never open below the fold.
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [active]);

  function select(id) {
    if (id === active) return;
    if (id === "Analytics") {
      if (activePanel) onPanelClick(activePanel); // toggles current panel off → Analytics
      return;
    }
    onPanelClick(id);
  }

  const comboCount = combos ? (combos.combos?.length || 0) + (combos.near_misses?.length || 0) : null;
  const cutCount = cuts ? (cuts.cuts?.length || 0) : null;

  const tabs = [
    { id: "Analytics", label: "Analytics" },
    { id: "Recommendations", label: "Suggest" },
    { id: "Cuts", label: "Cuts", count: cutCount },
    { id: "Combos", label: "Combos", count: comboCount },
    { id: "Upgrades", label: "Upgrades" },
    { id: "DrawOdds", label: "Odds" },
  ];

  return (
    <div className="sidebar-section insp" ref={rootRef}>
      <div className="insp-tabs" role="tablist" aria-label="Deck insights tools">
        {tabs.map((t) => {
          const isActive = active === t.id;
          const isBusy = busy === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              aria-controls="insp-pane"
              className={`insp-tab${isActive ? " active" : ""}`}
              onClick={() => select(t.id)}
              disabled={isBusy}
            >
              <span className={`insp-tab-icon${isBusy ? " insp-spin" : ""}`}>
                {isBusy ? <span className="insp-spinner" aria-hidden="true" /> : TAB_ICONS[t.id]}
              </span>
              <span className="insp-tab-label">{t.label}</span>
              {t.count != null && t.count > 0 && <span className="insp-tab-count">{t.count}</span>}
              {stalePanels?.has(t.id) && <span className="insp-tab-stale" title="Deck changed since these results" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="insp-body" id="insp-pane" role="tabpanel" aria-label="Insights tool">
        {busy === active && <LoadingIndicator label="Loading" active />}
        {busy !== active && (
          <>
            {["Recommendations", "Cuts", "Combos", "Upgrades"].includes(active) && onRefreshPanel && (
              <RefreshBar onRefresh={() => onRefreshPanel(active)} stale={stalePanels?.has(active)} />
            )}
            {active === "Analytics" && <AnalyticsPane result={result} comp={comp} format={format} />}
            {active === "Recommendations" && (
              <SuggestPane recs={recs} recCat={recCat} setRecCat={setRecCat}
                skipped={skipped} onSkip={onSkip} onClearSkipped={onClearSkipped}
                pinned={pinned} onTogglePin={onTogglePin} onAddCard={onAddCard} />
            )}
            {active === "Cuts" && (
              <CutsPane cuts={cuts} onRemoveCard={onRemoveCard}
                dismissedCuts={dismissedCuts} onDismissCut={onDismissCut}
                onClearDismissedCuts={onClearDismissedCuts} />
            )}
            {active === "Combos" && <CombosPane combos={combos} onAddCard={onAddCard} onGoldfish={onGoldfish} />}
            {active === "Upgrades" && (
              <UpgradesPane budgetSwaps={budgetSwaps} upgrades={upgrades}
                upgradeMode={upgradeMode} setUpgradeMode={setUpgradeMode} onSwapCard={onSwapCard} />
            )}
            {active === "DrawOdds" && (
              <DrawProbability result={result} commander={commander} format={format} compact />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Loaded results are cached across tab switches AND persisted across screens/
// reloads (Cuts is a paid AI call) — this is the explicit "get fresh results
// after editing the deck" action. `stale` = the deck's card list has changed
// since these results were generated; nothing re-runs without this click.
function RefreshBar({ onRefresh, stale }) {
  return (
    <div className="insp-pane-bar">
      {stale && <span className="insp-stale-badge">Deck changed</span>}
      <button className={`insp-act insp-refresh${stale ? " insp-refresh-hot" : ""}`} onClick={onRefresh}>
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
        </svg>
        Refresh
      </button>
    </div>
  );
}

/* ── Analytics (resting tab — local data only) ─────────────────────────────── */

function AnalyticsPane({ result, comp, format }) {
  const s = result?.stats || {};
  const mana = result?.mana || {};
  const legality = result?.legality || {};
  const bracket = result?.bracket || {};
  const bd = result?.breakdown || {};
  const price = bd.price_usd;

  const isCmdr = format === "commander" || format === "paupercommander";
  const cardCount = result?.total_cards;
  const cardCountStatus = isCmdr
    ? ((cardCount || 0) > 100 ? "bad" : (cardCount || 0) === 100 ? "good" : "warn")
    : ((cardCount || 0) >= 60 ? "good" : "warn");

  if (!result) return <p className="muted small insp-empty">Add cards — analytics update automatically.</p>;

  return (
    <div className="insp-analytics">
      <div className="stat-grid">
        <Stat k="Cards" v={cardCount != null ? (isCmdr ? `${cardCount}/100` : `${cardCount}/60+`) : "—"} className={cardCountStatus === "bad" ? "stat-danger" : ""} />
        <Stat k="Avg CMC" v={s.avg_cmc} />
        <Stat k="Price" v={price != null ? fmtUsd(price) : "—"}
          title={bd.prices_as_of ? `Prices as of ${bd.prices_as_of}` : null} />
        <Stat k="Bracket" v={bracket.bracket ?? "—"} />
      </div>
      <div className="insp-badges">
        <span className={`badge ${statusBadge(legality.overall_status || (legality.violations?.length ? "FAIL" : "PASS"))}`}>
          Legality: {legality.overall_status || (legality.violations?.length ? "issues" : "ok")}
        </span>
        <span className={`badge ${statusBadge(mana.overall_status)}`}>
          Mana: {mana.overall_status || "—"}
        </span>
      </div>

      {s.curve && (
        <>
          <h4 className="insp-subhead">Mana curve</h4>
          <Curve curve={s.curve} />
        </>
      )}

      <TypeBreakdown types={bd.types} total={cardCount} />
      <Colors mana={mana} />
      <ManaBase mana={mana} />
      <DeckDna comp={comp} />
      <Signals stats={s} />

      {legality.violations?.length > 0 && (
        <>
          <h4 className="insp-subhead">Legality issues</h4>
          <ul className="small insp-list">
            {legality.violations.map((v, i) => (
              <li key={i}>{v.message || v.detail || JSON.stringify(v)}</li>
            ))}
          </ul>
        </>
      )}

      {bracket.game_changers?.length > 0 && (
        <>
          <h4 className="insp-subhead">Game changers</h4>
          <p className="small insp-list">
            {bracket.game_changers.map((n, i) => (
              <span key={n}>{i > 0 && ", "}<CardPreview name={n} /></span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}

function Colors({ mana }) {
  const pct = mana.pip_demand_pct || {};
  const colors = WUBRG.filter((c) => pct[c]);
  if (!colors.length) return null;
  return (
    <>
      <h4 className="insp-subhead">Colors</h4>
      <div className="barlist">
        {colors.map((c) => (
          <div className="barrow" key={c}>
            <span className="blabel"><span className={`pip pip-${c}`}>{c}</span>{COLOR_NAME[c]}</span>
            <span className="btrack"><span className={`bfill f${c}`} style={{ width: `${pct[c]}%` }} /></span>
            <span className="bval">{pct[c]}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ManaBase({ mana }) {
  const v = mana.viability;
  if (!v) return null;
  return (
    <>
      <h4 className="insp-subhead">Mana base</h4>
      <div className="manabase">
        <div className="mbrow">
          <span>Sources <span className="muted">(lands+ramp)</span></span>
          <span>
            <strong>{v.mana_sources}</strong>
            <span className="muted"> / {v.recommended_sources}</span>{" "}
            <span className={`badge ${statusBadge(v.sources_status)}`}>{v.sources_status}</span>
          </span>
        </div>
        <div className="formula">
          {v.land_count} lands + {v.ramp_count} ramp · avg MV {v.avg_mv}
        </div>
        <div className="mbrow">
          <span>Lands <span className="muted">(min)</span></span>
          <span>
            <strong>{v.land_count}</strong>
            <span className="muted"> / {v.land_floor}</span>{" "}
            <span className={`badge ${statusBadge(v.land_status)}`}>{v.land_status}</span>
          </span>
        </div>
        <div className="mbrow">
          <span>Color fixing</span>
          <span className={`badge ${statusBadge(mana.color_balance_status)}`}>
            {mana.color_balance_status || "—"}
          </span>
        </div>
        {mana.color_balance_flags?.length > 0 && (
          <ul className="flaglist">
            {mana.color_balance_flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}
      </div>
    </>
  );
}

const TYPE_COLORS = {
  Creature: "#58b56a", Instant: "#4a7fd6", Sorcery: "#e5624c", Artifact: "#b9a066",
  Enchantment: "#b083d9", Planeswalker: "#d98cc0", Land: "#7f8598", Battle: "#d8a12b",
  Other: "#6b7180",
};

// Card-type distribution (from deck_breakdown.types) — the "what is this deck made
// of" read the old Analytics tab never surfaced.
function TypeBreakdown({ types, total }) {
  const entries = Object.entries(types || {});
  if (!entries.length) return null;
  const max = Math.max(...entries.map(([, n]) => n));
  return (
    <>
      <h4 className="insp-subhead">Composition</h4>
      <div className="barlist">
        {entries.map(([label, n]) => (
          <div className="barrow" key={label}>
            <span className="blabel">
              <span className="type-swatch" style={{ background: TYPE_COLORS[label] || TYPE_COLORS.Other }} />
              {label}
            </span>
            <span className="btrack">
              <span className="bfill" style={{ width: `${(n / max) * 100}%`, background: TYPE_COLORS[label] || TYPE_COLORS.Other }} />
            </span>
            <span className="bval">{total ? `${n}` : n}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// Role coverage ("Deck DNA") — reuses the composition categories that already drive
// the Assessment gap chips, shown here as count-vs-target bars.
function DeckDna({ comp }) {
  const cats = comp?.categories?.filter((c) => c.target) || [];
  if (!cats.length) return null;
  return (
    <>
      <h4 className="insp-subhead">Deck DNA — roles</h4>
      <div className="barlist">
        {cats.map((c) => {
          const pct = c.target ? Math.min(100, (c.count / c.target) * 100) : 100;
          const thin = c.status === "thin";
          return (
            <div className="barrow" key={c.key}>
              <span className="blabel">{c.label}</span>
              <span className="btrack">
                <span className={`bfill ${thin ? "bfill-warn" : "bfill-good"}`} style={{ width: `${pct}%` }} />
              </span>
              <span className={`bval${thin ? " role-thin" : ""}`}>
                {c.count}{c.target ? `/${c.target}` : ""}{thin ? " ·thin" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// At-a-glance power signals — game-changers, fast mana, free/alt-cost spells, and
// average creature body. Only chips with data render.
function Signals({ stats }) {
  const chips = [];
  if (stats.game_changer_count > 0) chips.push(["⚡", `${stats.game_changer_count} game-changer${stats.game_changer_count > 1 ? "s" : ""}`]);
  if (stats.fast_mana_count > 0) chips.push(["🚀", `${stats.fast_mana_count} fast mana`]);
  const altCount = stats.alternative_cost_cards?.length || 0;
  if (altCount > 0) chips.push(["🪄", `${altCount} free / alt-cost`]);
  if (stats.avg_power != null && stats.avg_toughness != null) {
    chips.push(["🛡️", `avg body ${stats.avg_power}/${stats.avg_toughness}`]);
  }
  if (!chips.length) return null;
  return (
    <>
      <h4 className="insp-subhead">Signals</h4>
      <div className="signal-chips">
        {chips.map(([icon, label]) => (
          <span className="signal-chip" key={label}><span aria-hidden="true">{icon}</span> {label}</span>
        ))}
      </div>
    </>
  );
}

function Stat({ k, v, title, className }) {
  return (
    <div className={`stat${className ? ` ${className}` : ""}`} title={title || undefined}>
      <div className="k">{k}</div>
      <div className="v">{v ?? "—"}</div>
    </div>
  );
}

/* ── Suggestions ───────────────────────────────────────────────────────────── */

const PinIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="11" height="11" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4h6l-1 7 3 3H7l3-3-1-7z" /><path d="M12 14v6" />
  </svg>
);

function SuggestPane({ recs, recCat, setRecCat, skipped, onSkip, onClearSkipped, pinned, onTogglePin, onAddCard }) {
  // Pinned suggestions render above the fetched list, survive refreshes and
  // deck edits, and clear only via unpin or landing in the deck. Synergy is
  // looked up across categories when the pin's source list is still loaded.
  const pinnedNames = [...(pinned || [])];
  const synergyOf = (name) => {
    for (const list of Object.values(recs?.categories || {})) {
      const hit = list.find((c) => c.name === name);
      if (hit?.synergy != null) return hit.synergy;
    }
    return null;
  };
  const hasRecs = recs?.categories && Object.keys(recs.categories).length > 0;
  if (!hasRecs && pinnedNames.length === 0) {
    return <p className="muted small insp-empty">No suggestions available for this deck.</p>;
  }
  const recList = (recs?.categories?.[recCat] || []).filter((c) => !skipped.has(c.name) && !pinned?.has(c.name));
  return (
    <>
      {pinnedNames.length > 0 && (
        <div className="insp-pinned">
          {pinnedNames.map((name) => (
            <div key={name} className="insp-row insp-row-pinned">
              <span className="insp-row-name"><CardPreview name={name} /></span>
              {synergyOf(name) != null && <span className="insp-row-meta">{(synergyOf(name) * 100).toFixed(0)}%</span>}
              <span className="insp-row-actions">
                <button className="insp-act insp-pin on" title="Unpin" aria-label={`Unpin ${name}`}
                  onClick={() => onTogglePin(name)}><PinIcon filled /></button>
                <button className="insp-act insp-act-good" onClick={() => onAddCard(name)}>+ Add</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {hasRecs && (
        <select className="insp-select" value={recCat} onChange={(e) => setRecCat(e.target.value)}>
          {REC_CATEGORIES.filter(([k]) => recs.categories[k]?.length).map(([k, label]) => (
            <option key={k} value={k}>{label} ({recs.categories[k].length})</option>
          ))}
        </select>
      )}
      {hasRecs && recList.length === 0 && (
        <p className="muted small insp-empty">Nothing left here — all added, pinned, or skipped.</p>
      )}
      {recList.map((c) => (
        <div key={c.name} className={`insp-row${c.in_deck ? " insp-row-dim" : ""}`}>
          <span className="insp-row-name"><CardPreview name={c.name} /></span>
          {c.synergy != null && <span className="insp-row-meta">{(c.synergy * 100).toFixed(0)}%</span>}
          {!c.in_deck && (
            <span className="insp-row-actions">
              <button className="insp-act insp-pin" title="Pin — keep this suggestion" aria-label={`Pin ${c.name}`}
                onClick={() => onTogglePin(c.name)}><PinIcon /></button>
              <button className="insp-act" onClick={() => onSkip(c.name)}>Skip</button>
              <button className="insp-act insp-act-good" onClick={() => onAddCard(c.name)}>+ Add</button>
            </span>
          )}
        </div>
      ))}
      {skipped?.size > 0 && (
        <p className="insp-hidden-note">
          {skipped.size} skipped
          <button className="insp-act insp-linklike" onClick={onClearSkipped}>Show again</button>
        </p>
      )}
    </>
  );
}

/* ── Cuts ──────────────────────────────────────────────────────────────────── */

function CutsPane({ cuts, onRemoveCard, dismissedCuts, onDismissCut, onClearDismissedCuts }) {
  if (!cuts) return null;
  const list = (cuts.cuts || []).filter((c) => !dismissedCuts?.has(c.name));
  const hiddenCount = (cuts.cuts?.length || 0) - list.length;
  if (!cuts.cuts?.length) return <p className="muted small insp-empty">No cuts suggested — the deck looks tight.</p>;
  return (
    <>
      {list.length === 0 && <p className="muted small insp-empty">All suggested cuts dismissed.</p>}
      {list.map((c) => (
        <div key={c.name} className="insp-row insp-row-tall">
          <span className="insp-row-name">
            <CardPreview name={c.name} />
            {c.reason && <span className="insp-row-reason">{c.reason}</span>}
          </span>
          <span className="insp-row-actions">
            {onDismissCut && <button className="insp-act" title="Keep this card — hide the suggestion" onClick={() => onDismissCut(c.name)}>Keep</button>}
            <button className="insp-act insp-act-bad" onClick={() => onRemoveCard(c.name)}>Remove</button>
          </span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <p className="insp-hidden-note">
          {hiddenCount} dismissed
          <button className="insp-act insp-linklike" onClick={onClearDismissedCuts}>Show again</button>
        </p>
      )}
    </>
  );
}

/* ── Combos ────────────────────────────────────────────────────────────────── */

// Mirror combo_search.py::_is_game_winning so the UI classification matches the
// backend's own labelling.
function comboResultText(c) {
  return (c.result || []).map((r) => (typeof r === "string" ? r : r?.name || "")).filter(Boolean);
}
function comboKind(c) {
  const t = comboResultText(c).join(" ").toLowerCase();
  if (t.includes("win the game") || t.includes("lose the game")) return "win";
  if (t.includes("infinite")) return "infinite";
  return "value";
}
const KIND_BADGE = {
  win: ["bad", "game-winning"],
  infinite: ["gold", "infinite"],
  value: ["good", "value"],
};

function ComboCard({ combo, missing, addable, onAddCard, onGoldfish }) {
  const [open, setOpen] = useState(false);
  const kind = comboKind(combo);
  const [badgeCls, badgeLabel] = KIND_BADGE[kind];
  const results = comboResultText(combo);
  const otherCards = missing
    ? (combo.cards || []).filter((n) => n !== missing)
    : (combo.cards || []);
  return (
    <div className={`combo-card combo-${missing ? "miss" : kind}`}>
      <div className="combo-top">
        {missing
          ? <span className="badge warn small">1 card away</span>
          : <span className={`badge ${badgeCls} small`}>{badgeLabel}</span>}
        {combo.bracket_tag && <span className="combo-chip">bracket {combo.bracket_tag}</span>}
        {addable && (
          <button className="insp-act insp-act-good combo-add" onClick={() => onAddCard(missing)}>
            + Add {missing.length > 22 ? "card" : missing}
          </button>
        )}
      </div>
      <div className="combo-cards">
        {otherCards.map((n, i) => (
          <span key={n}>
            {i > 0 && <span className="combo-plus"> + </span>}
            <CardPreview name={n} />
          </span>
        ))}
        {missing && (
          <>
            <span className="combo-plus"> + </span>
            <span className="combo-missing"><CardPreview name={missing} /></span>
          </>
        )}
      </div>
      {results.length > 0 && (
        <div className="combo-result"><span className="combo-arrow">→</span> {results.join(", ")}</div>
      )}
      {open && combo.description && <p className="combo-desc">{combo.description}</p>}
      {(combo.description || (!missing && onGoldfish)) && (
        <div className="combo-foot">
          {combo.mana_needed && <span className="combo-chip combo-mana">{combo.mana_needed}</span>}
          {!missing && onGoldfish && (combo.cards?.length > 0) && (
            <button className="combo-goldfish" onClick={() => onGoldfish(combo.cards)}
              title="Open Playtest with these pieces in your opening hand">
              ▶ Goldfish
            </button>
          )}
          {combo.description && (
            <button className="combo-fold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Hide steps ▴" : "Show steps ▾"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CombosPane({ combos, onAddCard, onGoldfish }) {
  if (!combos) return null;
  const list = combos.combos || [];
  const near = combos.near_misses || [];
  if (!list.length && !near.length) return <p className="muted small insp-empty">No combos or near-misses found.</p>;
  return (
    <div className="combo-list">
      {list.map((c, i) => <ComboCard key={`c${i}`} combo={c} onAddCard={onAddCard} onGoldfish={onGoldfish} />)}
      {near.length > 0 && (
        <>
          {list.length > 0 && <h4 className="insp-subhead">One card away</h4>}
          {near.map((c, i) => (
            <ComboCard key={`n${i}`} combo={c} missing={c.missing_card || c.missing_template}
              addable={Boolean(c.missing_card)} onAddCard={onAddCard} />
          ))}
        </>
      )}
    </div>
  );
}

/* ── Upgrades ──────────────────────────────────────────────────────────────── */

function UpgradesPane({ budgetSwaps, upgrades, upgradeMode, setUpgradeMode, onSwapCard }) {
  return (
    <>
      <div className="ai-panel-toggle insp-mode-toggle">
        <button className={upgradeMode === "budget" ? "active" : ""} onClick={() => setUpgradeMode("budget")}>Budget</button>
        <button className={upgradeMode === "power" ? "active" : ""} onClick={() => setUpgradeMode("power")}>Power</button>
      </div>
      {upgradeMode === "budget" && budgetSwaps?.swaps && (
        budgetSwaps.swaps.length === 0 ? (
          <p className="muted small insp-empty">Already budget-friendly!</p>
        ) : (
          <>
            <p className="insp-note">Save ~${budgetSwaps.total_savings?.toFixed(2)}</p>
            {budgetSwaps.swaps.map((sw) => (
              <div key={sw.card} className="insp-row insp-row-tall">
                <span className="insp-row-name insp-swap">
                  <CardPreview name={sw.card} /> <span className="muted">${sw.price}</span>
                  <span className="insp-swap-arrow">→</span>
                  <CardPreview name={sw.alternative.name} /> <span className="muted">${sw.alternative.price}</span>
                </span>
                <span className="insp-row-actions">
                  <button className="insp-act insp-act-good" onClick={() => onSwapCard(sw.card, sw.alternative.name)}>Swap</button>
                </span>
              </div>
            ))}
          </>
        )
      )}
      {upgradeMode === "power" && upgrades?.upgrades?.map((u) => (
        <div key={u.replaces} className="insp-row insp-row-tall">
          <span className="insp-row-name insp-swap">
            <CardPreview name={u.replaces} />
            <span className="insp-swap-arrow">→</span>
            <CardPreview name={u.replacement} />
            {u.price_usd != null && <span className="muted"> {fmtUsd(u.price_usd)}</span>}
          </span>
          <span className="insp-row-actions">
            <button className="insp-act insp-act-good" onClick={() => onSwapCard(u.replaces, u.replacement)}>Swap</button>
          </span>
        </div>
      ))}
    </>
  );
}
