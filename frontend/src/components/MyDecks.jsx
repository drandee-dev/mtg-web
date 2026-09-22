import { useEffect, useMemo, useState, useRef } from "react";
import { api, disassembleDecklist, getCardImage, FORMATS } from "../lib/api";
import { commanderNamesClean } from "../lib/deckParser";
import ExportDeckModal from "./ExportDeckModal";
import NewUserLanding, { UrlImportInline } from "./Landing";

const WUBRG_COLORS = ["W", "U", "B", "R", "G"];

// Commander art + color identity never change for a given card, so cache them in
// localStorage keyed by commander name — decks paint instantly on return visits.
const META_CACHE_KEY = "mtgweb:commanderMeta";

function readMetaCache() {
  try { return JSON.parse(localStorage.getItem(META_CACHE_KEY)) || {}; } catch { return {}; }
}

function writeMetaCache(cache) {
  try { localStorage.setItem(META_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota — skip */ }
}



function deckCardCount(text) {
  return (text || "").split("\n")
    .filter((l) => /^\s*\d/.test(l) && !/^\s*commander\s*$/i.test(l))
    .reduce((s, l) => s + (parseInt(l.trim(), 10) || 0), 0);
}

function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? "s" : ""} ago`;
}

function DeckHero({ deck, meta, onOpen, onPlaytest, onDelete, onRename, onClone, onExport }) {
  const art = meta?.art_crop;
  const colors = meta?.color_identity || [];
  // Equal-width segment per identity color (colorless commanders get a C segment).
  const barColors = meta ? (colors.length > 0 ? WUBRG_COLORS.filter((c) => colors.includes(c)) : ["C"]) : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [menuOpen]);

  const isCmdr = deck.format === "commander" || deck.format === "paupercommander";
  const count = deckCardCount(deck.decklist_text);
  const total = isCmdr ? 100 : 60;
  const when = relativeTime(deck.updated_at);
  const fmtLabel = (deck.format || "commander").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="deck-card">
      {/* Art */}
      <div className="deck-card-art" onClick={() => onOpen(deck)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(deck); } }}
        aria-label={`Open ${deck.name}`}>
        {art ? <img src={art} alt="" loading="lazy" /> : <div className="deck-card-art-ph" />}
        <div className="deck-card-art-gradient" />
      </div>
      {/* WUBRG color identity bar (Archidekt-style) */}
      {barColors.length > 0 && (
        <div className="deck-card-colorbar" aria-label={`Colors: ${barColors.join(", ")}`}>
          {barColors.map((c) => (
            <span key={c} className={`deck-card-colorseg colorseg-${c}`}>{c}</span>
          ))}
        </div>
      )}
      {/* Body */}
      <div className="deck-card-body">
        <div className="deck-card-name">{deck.name}</div>
        <div className="deck-card-row">
          <span className="deck-card-format">{fmtLabel}</span>
          <span className="deck-card-count">{count}/{total}</span>
        </div>
        <div className="deck-card-row">
          <span className="deck-card-time">
            {when === "Just now" && <span className="deck-card-dot" />}
            {when}
          </span>
          <div className="deck-card-menu-wrap" ref={menuRef}>
            <button className="deck-card-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Deck actions">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="3.5" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor"/></svg>
            </button>
            {menuOpen && (
              <div className="deck-card-menu">
                <button className="deck-card-menu-item" onClick={() => { setMenuOpen(false); onRename(deck); }}>Rename</button>
                <button className="deck-card-menu-item" onClick={() => { setMenuOpen(false); onClone(deck); }}>Clone deck</button>
                <div className="deck-card-menu-divider" />
                <button className="deck-card-menu-item" onClick={() => { setMenuOpen(false); onExport(deck); }}>Export…</button>
                <button className="deck-card-menu-item" onClick={() => { setMenuOpen(false); onPlaytest?.(deck); }}>Playtest</button>
                <div className="deck-card-menu-divider" />
                <button className="deck-card-menu-item deck-card-menu-danger" onClick={() => { setMenuOpen(false); onDelete(deck.id); }}>Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


export default function MyDecks({ decks, signedIn, cloud, onSave, onDelete, onOpen, onPlaytest, onNewDeck, onGuidedBuild, notify, refresh, setTab, decksIntent, onIntentConsumed, onOpenAccount }) {
  const [syncNudgeDismissed, setSyncNudgeDismissed] = useState(
    () => { try { return localStorage.getItem("mtgweb:syncnudge") === "1"; } catch { return true; } }
  );
  const showSyncNudge = signedIn === false && decks.length >= 2 && !syncNudgeDismissed && onOpenAccount;
  function dismissSyncNudge() {
    try { localStorage.setItem("mtgweb:syncnudge", "1"); } catch { /* best-effort */ }
    setSyncNudgeDismissed(true);
  }
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importFormat, setImportFormat] = useState("commander");
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [fetchedMeta, setFetchedMeta] = useState({});
  const [deckSearch, setDeckSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  const [sortDir, setSortDir] = useState("desc");
  const [exportModalDeck, setExportModalDeck] = useState(null);
  const searchRef = useRef(null);

  // Run a pending avatar-menu intent once the Decks tab mounts: "import" opens the
  // import panel, "search" focuses the deck-search box. Consume it so it fires once.
  useEffect(() => {
    if (!decksIntent) return;
    if (decksIntent === "import") setShowImport(true);
    else if (decksIntent === "search") searchRef.current?.focus();
    onIntentConsumed?.();
  }, [decksIntent, onIntentConsumed]);

  // Cached commanders resolve at render time (instant paint); the rest are listed
  // in `missing` for the fetch effect below.
  const { cachedMeta, missing } = useMemo(() => {
    const cache = readMetaCache();
    const cachedMeta = {};
    const missing = [];
    for (const deck of decks) {
      const { commander } = disassembleDecklist(deck.decklist_text);
      if (!commander) continue;
      const cmdrName = commanderNamesClean(commander)[0];
      if (cache[cmdrName]) cachedMeta[deck.id] = cache[cmdrName];
      else missing.push([deck.id, cmdrName]);
    }
    return { cachedMeta, missing };
  }, [decks]);

  const deckMeta = useMemo(() => ({ ...cachedMeta, ...fetchedMeta }), [cachedMeta, fetchedMeta]);

  useEffect(() => {
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const cache = readMetaCache();
      let dirty = false;
      for (const [id, cmdrName] of missing) {
        if (cancelled) break;
        try {
          const data = await getCardImage(cmdrName);
          if (data?.found) {
            const entry = {
              art_crop: data.art_crop,
              color_identity: data.color_identity,
              bracket: null,
            };
            cache[cmdrName] = entry;
            dirty = true;
            if (!cancelled) setFetchedMeta((m) => ({ ...m, [id]: entry }));
          }
        } catch { /* ignore */ }
      }
      if (dirty) writeMetaCache(cache);
    })();
    return () => { cancelled = true; };
  }, [missing]);

  async function doImport() {
    if (!importText.trim()) return notify("Paste a decklist to import.");
    setBusy(true);
    try {
      await onSave({
        name: importName.trim() || "Imported deck",
        format: importFormat,
        decklist_text: importText,
      });
      setImportText("");
      setImportName("");
      setShowImport(false);
      notify("Imported.");
    } finally {
      setBusy(false);
    }
  }

  async function doImportUrl(url) {
    const trimmed = (url || "").trim();
    if (!trimmed) return notify("Paste a deck URL to import.");
    setBusy(true);
    try {
      const res = await api.importUrl(trimmed);
      await onSave({
        name: res.name || "Imported deck",
        format: res.format || "commander",
        decklist_text: res.decklist || "",
      });
      notify(`Imported from ${res.source || "URL"}.`);
    } catch (e) {
      notify(`Import failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const txt = String(reader.result);
        if (file.name.endsWith(".json")) {
          const d = JSON.parse(txt);
          setImportText(d.decklist_text || "");
          setImportName(d.name || file.name.replace(/\.json$/, ""));
          if (d.format) setImportFormat(d.format);
        } else {
          setImportText(txt);
          setImportName(file.name.replace(/\.[^.]+$/, ""));
        }
        setShowImport(true);
      } catch (err) {
        notify(`Could not read file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  async function rename(deck) {
    const name = prompt("Rename deck:", deck.name);
    if (name && name !== deck.name) await onSave({ ...deck, name });
  }

  // Clone: create a NEW deck (no id) with the same contents, like App.jsx's clone.
  async function clone(deck) {
    const name = prompt("Name the copy:", `${deck.name || "Untitled deck"} (copy)`);
    if (!name) return;
    await onSave({ name: name.trim(), format: deck.format, decklist_text: deck.decklist_text });
    notify("Deck cloned.");
  }

  return (
    <div>
      <ExportDeckModal deck={exportModalDeck} onClose={() => setExportModalDeck(null)} notify={notify} />

      {/* Import panel (collapsible) */}
      {showImport && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".5rem" }}>
            {decks.length === 0 && (
              <button className="ghost small" onClick={() => setShowImport(false)} style={{ padding: ".2rem .6rem", fontSize: ".8rem", flexShrink: 0 }}>← Back</button>
            )}
            <h3 style={{ margin: 0 }}>Import a deck</h3>
          </div>
          <p className="muted small">Paste from Archidekt / Moxfield / Arena, or load a file.</p>
          <div className="row">
            <input placeholder="Deck name" value={importName} onChange={(e) => setImportName(e.target.value)} style={{ flex: "1 1 200px" }} />
            <select value={importFormat} onChange={(e) => setImportFormat(e.target.value)} style={{ width: "auto" }}>
              {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"1 Sol Ring\n…"} />
          <div className="row" style={{ marginTop: ".5rem" }}>
            <button className="primary" onClick={doImport} disabled={busy}>Save</button>
            <label style={{ margin: 0, cursor: "pointer" }}>
              <input type="file" accept=".txt,.json,.csv" onChange={onImportFile} style={{ display: "none" }} />
              <span className="badge" style={{ cursor: "pointer" }}>Load file…</span>
            </label>
            <button className="ghost small" onClick={() => setShowImport(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* New user landing */}
      {decks.length === 0 && !showImport && (
        <NewUserLanding
          onNewDeck={onNewDeck}
          onGuidedBuild={onGuidedBuild}
          onShowImport={() => setShowImport(true)}
          onImportUrl={doImportUrl}
          busy={busy}
        />
      )}

      {/* Returning user */}
      {decks.length > 0 && (
        <>
          {/* Header row */}
          <div className="spread" style={{ margin: ".5rem 0 .75rem", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-.02em" }}>My Decks</h2>
              <span className="muted small">{cloud ? "Cloud-synced" : "This device"} · {decks.length} deck{decks.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="row" style={{ gap: ".5rem" }}>
              <UrlImportInline onImport={doImportUrl} busy={busy} />
              {onGuidedBuild && (
                <button className="guided-build-btn" onClick={onGuidedBuild}
                  style={{ background: "transparent", border: "1px solid rgba(201,138,58,.45)", color: "var(--accent)", borderRadius: "var(--radius)", padding: ".45rem .85rem", fontSize: ".8rem", fontWeight: 600 }}>
                  ✨ Guided Build
                </button>
              )}
              {onNewDeck && <button className="primary" onClick={onNewDeck}>+ New Deck</button>}
            </div>
          </div>

          {/* Filter toolbar */}
          <div className="mydecks-filterbar">
            <div className="mydecks-filter-group mydecks-filter-search">
              <label className="mydecks-filter-label">Search</label>
              <div className="mydecks-filter-inputwrap">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={deckSearch}
                  onChange={(e) => setDeckSearch(e.target.value)}
                  placeholder="Search decks…"
                  className="mydecks-filter-input"
                />
              </div>
            </div>
            <div className="mydecks-filter-group">
              <label className="mydecks-filter-label">Format</label>
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className="mydecks-filter-select"
              >
                <option value="all">All</option>
                {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
            <div className="mydecks-filter-group">
              <label className="mydecks-filter-label">Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="mydecks-filter-select"
              >
                <option value="updated">Updated</option>
                <option value="name">Name</option>
                <option value="format">Format</option>
              </select>
            </div>
            <div className="mydecks-filter-group">
              <label className="mydecks-filter-label">&nbsp;</label>
              <button
                className="mydecks-filter-dir"
                onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
                aria-label={sortDir === "asc" ? "Sort descending" : "Sort ascending"}
              >
                {sortDir === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>

          {/* Sync nudge — anonymous users with real collections risk silent data
              loss; one-time banner, dismissal persists. */}
          {showSyncNudge && (
            <div className="sync-nudge">
              <span className="sync-nudge-text">
                <strong>{decks.length} decks</strong> live only on this device — sign in to sync them across devices and keep them safe.
              </span>
              <span className="sync-nudge-actions">
                <button className="sync-nudge-cta" onClick={onOpenAccount}>Sign in</button>
                <button className="sync-nudge-x" aria-label="Dismiss sync reminder" onClick={dismissSyncNudge}>✕</button>
              </span>
            </div>
          )}

          {/* Deck hero grid — New Deck tile leads (Archidekt-style) */}
          <div className="hero-grid">
            {onNewDeck && (
              <div className="deck-card-new" onClick={onNewDeck} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNewDeck(); } }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem", lineHeight: 1, color: "var(--muted)" }}>+</div>
                  <div style={{ fontSize: "var(--fs-xs)", marginTop: ".3rem", color: "var(--muted)" }}>New Deck</div>
                </div>
              </div>
            )}
            {decks
              .filter((d) => {
                if (deckSearch && !d.name?.toLowerCase().includes(deckSearch.toLowerCase())) return false;
                if (formatFilter !== "all" && d.format !== formatFilter) return false;
                return true;
              })
              .sort((a, b) => {
                let cmp = 0;
                if (sortBy === "updated") cmp = (a.updated_at || "").localeCompare(b.updated_at || "");
                else if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "");
                else if (sortBy === "format") cmp = (a.format || "").localeCompare(b.format || "");
                return sortDir === "desc" ? -cmp : cmp;
              })
              .map((d) => (
              <DeckHero
                key={d.id}
                deck={d}
                meta={deckMeta[d.id]}
                onOpen={onOpen}
                onPlaytest={onPlaytest}
                onDelete={onDelete}
                onRename={rename}
                onClone={clone}
                onExport={setExportModalDeck}
              />
            ))}
          </div>

          {/* Feature strip for returning users */}
          <div className="feature-strip">
            <button className="feature-strip-btn" onClick={() => setTab("deck")}>🃏 Analyze & Build</button>
            <button className="feature-strip-btn" onClick={() => setTab("rules")}>📖 Rules & Rulings</button>
            <button className="feature-strip-btn" onClick={() => setTab("cards")}>🔍 Card Search</button>
            <button className="feature-strip-btn" onClick={() => setTab("deck")}>✨ AI Advisor</button>
          </div>
        </>
      )}
    </div>
  );
}
