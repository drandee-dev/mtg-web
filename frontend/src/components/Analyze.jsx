import { useState } from "react";
import { api, assembleDecklist, FORMATS } from "../lib/api";
import Curve from "./Curve";
import CardPreview from "./CardPreview";
import CommanderInput from "./CommanderInput";
import LoadingIndicator from "./LoadingIndicator";

const WUBRG = ["W", "U", "B", "R", "G", "C"];
const COLOR_NAME = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" };

function statusBadge(status) {
  const s = (status || "").toUpperCase();
  if (s === "PASS" || s === "OK") return "good";
  if (s === "WARN") return "warn";
  return "bad";
}

// Paste a decklist, analyze it, and (optionally) hand the deck up to be saved.
// decklist/format are lifted to App so the Build tab shares the same list.
export default function Analyze({ decklist, setDecklist, format, setFormat, commander, setCommander, onSaveRequest, onPlaytest, onShare, notify }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const isCommanderFmt = format === "commander" || format === "paupercommander";

  async function run() {
    if (!decklist.trim()) return notify("Paste a decklist first.");
    setBusy(true);
    try {
      const full = assembleDecklist(decklist, isCommanderFmt ? commander : "");
      setResult(await api.analyze(full, format));
    } catch (e) {
      notify(`Analyze failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>Analyze a deck</h2>
        <p className="muted small">
          Paste a list from Archidekt, Moxfield, Arena/MTGO, a CSV export, or plain text —
          the format is detected automatically.
        </p>

        {isCommanderFmt && (
          <CommanderInput commander={commander} setCommander={setCommander} />
        )}

        <label htmlFor="decklist">Decklist</label>
        <textarea
          id="decklist"
          value={decklist}
          onChange={(e) => setDecklist(e.target.value)}
          placeholder={"1 Sol Ring\n1 Llanowar Elves\n1 Cultivate\n..."}
        />
        <div className="row" style={{ marginTop: ".6rem" }}>
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: "auto" }}>
            {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <button className="primary" onClick={run} disabled={busy}>
            {busy ? "Analyzing…" : "Analyze"}
          </button>
          {result && (
            <button onClick={() => onSaveRequest({ format, decklist_text: decklist })}>
              Save deck
            </button>
          )}
          {decklist.trim() && onPlaytest && (
            <button onClick={onPlaytest}>Playtest</button>
          )}
          {decklist.trim() && onShare && (
            <button onClick={onShare}>Share</button>
          )}
        </div>
      </div>

      <LoadingIndicator label="Analyzing deck" active={busy} />
      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }) {
  const s = result.stats || {};
  const mana = result.mana || {};
  const legality = result.legality || {};
  const bracket = result.bracket || {};
  const bd = result.breakdown || {};
  const price = bd.price_usd;

  return (
    <div className="panel">
      <div className="spread">
        <h2>Results</h2>
        <span className="row">
          {result.format === "commander" && bracket.bracket != null && (
            <span className="badge">Bracket {bracket.bracket} · {bracket.name}</span>
          )}
          <span className={`badge ${statusBadge(legality.overall_status || (legality.violations?.length ? "FAIL" : "PASS"))}`}>
            Legality: {legality.overall_status || (legality.violations?.length ? "issues" : "ok")}
          </span>
          <span className={`badge ${statusBadge(mana.overall_status)}`}>
            Mana: {mana.overall_status || "—"}
          </span>
        </span>
      </div>

      <div className="stat-grid" style={{ margin: ".6rem 0 1rem" }}>
        <Stat k="Cards" v={result.total_cards} />
        <Stat k="Lands" v={s.land_count} />
        <Stat k="Avg CMC" v={s.avg_cmc} />
        <Stat k="Price" v={price != null ? `$${price.toFixed(2)}` : "—"}
          sub={bd.prices_as_of ? `as of ${bd.prices_as_of}` : null} />
      </div>

      <SectionTitle title="Mana curve" />
      <Curve curve={s.curve} />

      <Colors mana={mana} />

      <ManaBase mana={mana} format={result.format} />

      <Breakdown title="Card types" data={bd.types} />
      <Breakdown title="Rarity" data={bd.rarities} />

      {bracket.game_changers?.length > 0 && (
        <p className="small" style={{ marginTop: "1rem" }}>
          <span className="muted">Game changers: </span>
          {bracket.game_changers.map((n, i) => (
            <span key={n}>{i > 0 && ", "}<CardPreview name={n} /></span>
          ))}
        </p>
      )}

      {s.alternative_cost_cards?.length > 0 && (
        <p className="small">
          <span className="muted">Alternative-cost cards: </span>
          {s.alternative_cost_cards.map((c, i) => (
            <span key={c.name}>{i > 0 && ", "}<CardPreview name={c.name} /></span>
          ))}
        </p>
      )}

      {Array.isArray(legality.violations) && legality.violations.length > 0 && (
        <>
          <SectionTitle title="Legality issues" />
          <ul className="small">
            {legality.violations.map((v, i) => (
              <li key={i}>{v.message || v.detail || JSON.stringify(v)}</li>
            ))}
          </ul>
        </>
      )}

      {result.unresolved?.length > 0 && (
        <p className="small" style={{ marginTop: "1rem" }}>
          <span className="badge warn">Unrecognized</span>{" "}
          {result.unresolved.join(", ")} — check spelling or set codes.
        </p>
      )}
    </div>
  );
}

function SectionTitle({ title, hint }) {
  return (
    <div className="section-title">
      <h3>{title}</h3>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// Colored-pip demand as WUBRG bars — the deck's color weighting at a glance.
function Colors({ mana }) {
  const pct = mana.pip_demand_pct || {};
  const colors = WUBRG.filter((c) => pct[c]);
  if (!colors.length) return null;
  return (
    <>
      <SectionTitle title="Colors" hint="share of colored mana symbols" />
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

// Honest explanation of the mana base: total sources (lands + ramp) vs a curve-based
// target, a real-lands floor, and color fixing. Replaces the opaque Burgess land formula.
function ManaBase({ mana }) {
  const v = mana.viability;
  if (!v) return null;
  return (
    <>
      <SectionTitle title="Mana base" hint="why the Mana status is what it is" />
      <div className="manabase">
        <div className="mbrow">
          <span>Mana sources <span className="muted">(lands + ramp)</span></span>
          <span>
            <strong>{v.mana_sources}</strong>
            <span className="muted"> / {v.recommended_sources} for this curve</span>{" "}
            <span className={`badge ${statusBadge(v.sources_status)}`}>{v.sources_status}</span>
          </span>
        </div>
        <div className="formula">
          {v.land_count} lands + {v.ramp_count} ramp · target scales with avg mana value ({v.avg_mv})
        </div>
        <div className="mbrow">
          <span>Lands <span className="muted">(minimum)</span></span>
          <span>
            <strong>{v.land_count}</strong>
            <span className="muted"> / {v.land_floor} floor</span>{" "}
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

// Count bars for types / rarity. Bar width is relative to the largest bucket.
function Breakdown({ title, data }) {
  const entries = Object.entries(data || {});
  if (!entries.length) return null;
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <>
      <SectionTitle title={title} />
      <div className="barlist">
        {entries.map(([label, v]) => (
          <div className="barrow" key={label}>
            <span className="blabel">{label}</span>
            <span className="btrack"><span className="bfill" style={{ width: `${(v / max) * 100}%` }} /></span>
            <span className="bval">{v}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ k, v, sub }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v ?? "—"}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}
