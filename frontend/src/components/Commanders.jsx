// Commander browse directory + per-commander strategy page (tapped-decks gameplan,
// Job 2). Navigation is the app's existing ?tab=&slug= query-param pattern through
// lib/backstack's single popstate owner — no second router (see App.jsx).
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { fmtUsd } from "../lib/format";
import { useCardImage } from "../lib/hooks";
import ManaCost from "./deck/ManaCost";

const COLORS = ["W", "U", "B", "R", "G"];
const PAGE_SIZE = 60;

// Fetched once per session and shared across tab switches — the same
// module-level-cache pattern CardSearch uses for its last search.
let _dirPromise = null;
function loadDirectory() {
  if (!_dirPromise) {
    _dirPromise = api.commanderDirectory().catch((e) => {
      _dirPromise = null;
      throw e;
    });
  }
  return _dirPromise;
}

function colorMatches(identity, allowed) {
  if (allowed.size === 0) return true;
  return identity.every((c) => allowed.has(c));
}

function CommanderTile({ entry, onOpen }) {
  const data = useCardImage(entry.name);
  const img = data?.border_crop || data?.image || null;
  return (
    <div
      className="card-thumb"
      role="listitem"
      tabIndex={0}
      onClick={() => onOpen(entry.slug)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(entry.slug); } }}
      aria-label={entry.name}
    >
      {img ? (
        <img src={img} alt={entry.name} width="180" height="251" loading="lazy" />
      ) : (
        <div className="card-thumb-placeholder">{entry.name}</div>
      )}
    </div>
  );
}

function ChipRow({ label, values }) {
  if (!values?.length) return null;
  return (
    <div style={{ marginBottom: ".4rem" }}>
      <span className="muted small" style={{ marginRight: ".4rem" }}>{label}</span>
      {values.map((v) => (
        <span key={v} className="badge gold" style={{ marginRight: ".3rem" }}>{v}</span>
      ))}
    </div>
  );
}

function CommanderDetail({ entry, onBack, onBuildWithStrategy, onBuildFromScratch }) {
  const data = useCardImage(entry.name);
  const hasChips = entry.playstyle || entry.difficulty || entry.wins_via?.length || entry.themes?.length;

  return (
    <div>
      <div className="panel">
        <button className="ghost small" onClick={onBack}>← Back to commanders</button>
      </div>

      <div className="panel">
        <div className="commander-detail-hero">
          <img
            src={data?.art_crop || data?.image || ""}
            alt={entry.name}
            className="commander-detail-art"
            loading="lazy"
          />
          <div>
            <h2 style={{ marginBottom: ".2rem" }}>{entry.name}</h2>
            <div className="row" style={{ marginBottom: ".4rem" }}>
              <ManaCost cost={data?.mana_cost} />
              <span className="muted small">{data?.type_line}</span>
            </div>
            <div className="row muted small" style={{ marginBottom: ".6rem" }}>
              {entry.edhrec_rank != null && <span>EDHREC #{entry.edhrec_rank}</span>}
              {data?.price_usd != null && <span>{fmtUsd(data.price_usd)}</span>}
            </div>

            {hasChips ? (
              <div>
                {(entry.playstyle || entry.difficulty) && (
                  <div style={{ marginBottom: ".4rem" }}>
                    {entry.playstyle && <span className="badge" style={{ marginRight: ".3rem" }}>{entry.playstyle}</span>}
                    {entry.difficulty && <span className="badge">{entry.difficulty}</span>}
                  </div>
                )}
                <ChipRow label="Wins via" values={entry.wins_via} />
                <ChipRow label="Themes" values={entry.themes} />
              </div>
            ) : (
              <p className="muted small">Strategy chips not available for this commander yet.</p>
            )}

            <div className="row" style={{ marginTop: ".8rem" }}>
              <button className="primary" onClick={() => onBuildWithStrategy(entry.name)}>
                Build with strategy
              </button>
              <button onClick={() => onBuildFromScratch(entry.name)}>Build from scratch</button>
            </div>
          </div>
        </div>
      </div>

      {entry.oracle_text && (
        <div className="panel">
          <p style={{ whiteSpace: "pre-wrap" }}>{entry.oracle_text}</p>
        </div>
      )}
    </div>
  );
}

export default function Commanders({ slug, setSlug, onBuildWithStrategy, onBuildFromScratch, notify }) {
  const [all, setAll] = useState(null); // full directory, loaded once
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState(() => new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    loadDirectory()
      .then((r) => { if (!cancelled) setAll(r.commanders || []); })
      .catch((e) => { if (!cancelled) { setError(e.message); notify?.(`Couldn't load commanders: ${e.message}`); } });
    return () => { cancelled = true; };
  }, [notify]);

  function toggleColor(c) {
    setColors((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
    setVisibleCount(PAGE_SIZE);
  }

  const filtered = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLowerCase();
    return all.filter((e) =>
      (!q || e.name.toLowerCase().includes(q)) &&
      colorMatches(e.color_identity || [], colors),
    );
  }, [all, query, colors]);

  const entry = slug && all ? all.find((e) => e.slug === slug) : null;

  if (slug) {
    if (!all) return <div className="panel"><p className="muted small">Loading…</p></div>;
    if (!entry) {
      return (
        <div className="panel">
          <p className="muted small">Commander not found.</p>
          <button className="ghost small" onClick={() => setSlug(null)}>← Back to commanders</button>
        </div>
      );
    }
    return (
      <CommanderDetail
        entry={entry}
        onBack={() => setSlug(null)}
        onBuildWithStrategy={onBuildWithStrategy}
        onBuildFromScratch={onBuildFromScratch}
      />
    );
  }

  return (
    <div>
      <div className="panel">
        <h2>Commanders</h2>
        <p className="muted small">Every commander-eligible card, ordered by EDHREC rank.</p>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
          placeholder="Search by name…"
          style={{ marginBottom: ".6rem" }}
        />
        <div className="row" role="group" aria-label="Filter by color identity">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`color-filter-pip ts-pip ts-pip-${c.toLowerCase()}${colors.has(c) ? " selected" : ""}`}
              aria-pressed={colors.has(c)}
              aria-label={`Filter by ${c}`}
              onClick={() => toggleColor(c)}
            >
              {c}
            </button>
          ))}
          {colors.size > 0 && (
            <button className="ghost small" onClick={() => { setColors(new Set()); setVisibleCount(PAGE_SIZE); }}>
              Clear colors
            </button>
          )}
        </div>
      </div>

      {error && <div className="panel"><p className="muted small">Couldn't load commanders: {error}</p></div>}

      {all && (
        <div className="panel">
          <p className="muted small">{filtered.length} commander{filtered.length === 1 ? "" : "s"}</p>
          <div className="card-grid" role="list">
            {filtered.slice(0, visibleCount).map((e) => (
              <CommanderTile key={e.slug} entry={e} onOpen={setSlug} />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="row" style={{ marginTop: ".8rem", justifyContent: "center" }}>
              <button onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>Load more</button>
            </div>
          )}
        </div>
      )}

      {!all && !error && <div className="panel"><p className="muted small">Loading commanders…</p></div>}
    </div>
  );
}
