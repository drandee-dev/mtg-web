import { useEffect, useMemo, useState, useRef } from "react";
import { api, disassembleDecklist, getCardImage, FORMATS } from "../lib/api";
import ExportDeckModal from "./ExportDeckModal";

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

const HERO_ART = "https://cards.scryfall.io/art_crop/front/8/a/8a2813cb-c73c-4a50-b278-2f13deb71773.jpg";


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

function UrlImportInline({ onImport, busy }) {
  const [url, setUrl] = useState("");
  return (
    <div className="url-import-inline">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M6 9.5a3.5 3.5 0 0 0 4.95 0l1.75-1.75a3.5 3.5 0 0 0-4.95-4.95L6.4 4.2"/><path d="M10 6.5a3.5 3.5 0 0 0-4.95 0L3.3 8.25a3.5 3.5 0 0 0 4.95 4.95L9.6 11.8"/></svg>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onImport(url); }}
        placeholder="Paste Archidekt / Moxfield URL"
        className="url-import-inline-input"
      />
      <button className="url-import-inline-btn" disabled={busy} onClick={() => onImport(url)}>
        {busy ? "…" : "Import"}
      </button>
    </div>
  );
}

function NewUserLanding({ onNewDeck, onGuidedBuild, onShowImport, onImportUrl, busy }) {
  const [importUrl, setImportUrl] = useState("");
  const [desktopUrl, setDesktopUrl] = useState("");
  const [showDesktopUrl, setShowDesktopUrl] = useState(false);
  const urlInputRef = useRef(null);

  return (
    <div className="landing-p2">
      {/* Hero art banner (mobile) */}
      <div className="landing-hero-mobile">
        <img src={HERO_ART} alt="" className="landing-hero-img" />
        <div className="landing-hero-gradient" />
        <div className="landing-hero-text">
          <div className="landing-headline">Build better<br/>MTG decks</div>
          <div className="landing-subtext">AI analysis · instant import · rules Q&A</div>
        </div>
      </div>

      {/* Desktop hero: two-column split */}
      <div className="landing-hero-desktop">
        {/* Background art */}
        <div className="landing-desktop-bg">
          <img src={HERO_ART} alt="" />
          <div className="landing-desktop-bg-overlay" />
        </div>

        {/* Left column */}
        <div className="landing-desktop-left">
          <div className="landing-badge-pill">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6H14L10.5 9L12 13.5L8 11L4 13.5L5.5 9L2 6H6.5L8 1.5Z" stroke="#c98a3a" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            <span>AI-Powered Deck Builder</span>
          </div>
          <div className="landing-desktop-headline">Build better<br/>MTG decks</div>
          <p className="landing-desktop-subtext">AI synergy analysis, instant import from any site, and a rules assistant — all in one place.</p>
          <div className="landing-desktop-ctas">
            <button className="landing-cta-primary" onClick={onGuidedBuild}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6H14L10.5 9L12 13.5L8 11L4 13.5L5.5 9L2 6H6.5L8 1.5Z" fill="currentColor"/></svg>
              Start with AI
            </button>
            <button className="landing-cta-secondary" onClick={onNewDeck}>Analyze a Deck →</button>
          </div>
          <div className="landing-desktop-chips">
            <span className="landing-chip-label">Or:</span>
            <button className={`landing-chip${showDesktopUrl ? " landing-chip-active" : ""}`} onClick={() => setShowDesktopUrl((v) => !v)}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 9.5a3.5 3.5 0 0 0 4.95 0l1.75-1.75a3.5 3.5 0 0 0-4.95-4.95L6.4 4.2"/><path d="M10 6.5a3.5 3.5 0 0 0-4.95 0L3.3 8.25a3.5 3.5 0 0 0 4.95 4.95L9.6 11.8"/></svg>
              Import URL
            </button>
            <button className="landing-chip" onClick={onShowImport}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h10M3 8h10M3 11h6"/></svg>
              Paste Decklist
            </button>
            <button className="landing-chip landing-chip-guided" onClick={onGuidedBuild}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6H14L10.5 9L12 13.5L8 11L4 13.5L5.5 9L2 6H6.5L8 1.5Z" stroke="#e5b84c" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              Guided Wizard
            </button>
          </div>
          {showDesktopUrl && (
            <div className="landing-desktop-url-expand">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M6 9.5a3.5 3.5 0 0 0 4.95 0l1.75-1.75a3.5 3.5 0 0 0-4.95-4.95L6.4 4.2"/><path d="M10 6.5a3.5 3.5 0 0 0-4.95 0L3.3 8.25a3.5 3.5 0 0 0 4.95 4.95L9.6 11.8"/></svg>
              <input
                type="url"
                autoFocus
                value={desktopUrl}
                onChange={(e) => setDesktopUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onImportUrl?.(desktopUrl); setShowDesktopUrl(false); }
                  if (e.key === "Escape") setShowDesktopUrl(false);
                }}
                placeholder="Paste Archidekt / Moxfield URL…"
                className="landing-url-input"
              />
              <button className="landing-url-btn" disabled={busy} onClick={() => { onImportUrl?.(desktopUrl); setShowDesktopUrl(false); }}>
                {busy ? "Importing…" : "Import"}
              </button>
              <button className="landing-chip" style={{ padding: "5px 10px" }} onClick={() => setShowDesktopUrl(false)}>✕</button>
            </div>
          )}
          <div className="landing-footnote">Free to start · Scryfall-powered · EDHREC-integrated</div>
        </div>

        {/* Right column: AI chat preview */}
        <div className="landing-desktop-right">
          <AIChatPreview />
        </div>
      </div>

      {/* Mobile scroll body */}
      <div className="landing-body-mobile">
        {/* Primary CTA card */}
        <div className="landing-ai-card">
          <div className="landing-ai-card-glow" />
          <div className="landing-ai-badge">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6H14L10.5 9L12 13.5L8 11L4 13.5L5.5 9L2 6H6.5L8 1.5Z" stroke="#c98a3a" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            <span>AI-Powered</span>
          </div>
          <div className="landing-ai-title">Start with AI</div>
          <div className="landing-ai-desc">Describe your deck idea in plain English</div>
          {/* Mini chat preview */}
          <div className="landing-mini-chat">
            <div className="landing-mini-user">
              <div className="landing-mini-user-bubble">&ldquo;Build a Nethroi graveyard deck&rdquo;</div>
            </div>
            <div className="landing-mini-ai">
              <div className="landing-mini-ai-avatar">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6H14L10.5 9L12 13.5L8 11L4 13.5L5.5 9L2 6H6.5L8 1.5Z" fill="#14100a"/></svg>
              </div>
              <div className="landing-mini-ai-text">Found 12 synergy cards — <span style={{ color: "var(--good)" }}>Eternal Witness</span>, <span style={{ color: "var(--good)" }}>Viscera Seer</span>...</div>
            </div>
          </div>
          <button className="landing-start-btn" onClick={onGuidedBuild}>Start Building →</button>
        </div>

        {/* Or start another way */}
        <div className="landing-or-label">Or start another way</div>

        {/* 3 secondary CTAs */}
        <div className="landing-secondary-ctas">
          <div className="landing-sec-cta" onClick={() => urlInputRef.current?.focus()}>
            <div className="landing-sec-icon" style={{ background: "rgba(124,172,248,.1)" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#7cacf8" strokeWidth="1.5" strokeLinecap="round"><path d="M6 9.5a3.5 3.5 0 0 0 4.95 0l1.75-1.75a3.5 3.5 0 0 0-4.95-4.95L6.4 4.2"/><path d="M10 6.5a3.5 3.5 0 0 0-4.95 0L3.3 8.25a3.5 3.5 0 0 0 4.95 4.95L9.6 11.8"/></svg>
            </div>
            <div className="landing-sec-name">Import URL</div>
            <div className="landing-sec-sub">Archidekt · Moxfield</div>
          </div>
          <div className="landing-sec-cta" onClick={onShowImport}>
            <div className="landing-sec-icon" style={{ background: "rgba(61,206,138,.08)" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#3dce8a" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h10M3 8h10M3 11h6"/></svg>
            </div>
            <div className="landing-sec-name">Paste List</div>
            <div className="landing-sec-sub">Any format</div>
          </div>
          <div className="landing-sec-cta" onClick={onGuidedBuild}>
            <div className="landing-sec-icon" style={{ background: "rgba(229,184,76,.08)" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L9 5.5H13L10 7.5L11 11L8 9L5 11L6 7.5L3 5.5H7L8 2Z" stroke="#e5b84c" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            </div>
            <div className="landing-sec-name">Guided</div>
            <div className="landing-sec-sub">Step-by-step</div>
          </div>
        </div>

        {/* URL inline import */}
        <div className="landing-url-bar">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M6 9.5a3.5 3.5 0 0 0 4.95 0l1.75-1.75a3.5 3.5 0 0 0-4.95-4.95L6.4 4.2"/><path d="M10 6.5a3.5 3.5 0 0 0-4.95 0L3.3 8.25a3.5 3.5 0 0 0 4.95 4.95L9.6 11.8"/></svg>
          <input
            ref={urlInputRef}
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onImportUrl?.(importUrl); }}
            placeholder="archidekt.com/decks/… or moxfield.com/…"
            className="landing-url-input"
          />
          <button className="landing-url-btn" disabled={busy} onClick={() => onImportUrl?.(importUrl)}>
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AIChatPreview() {
  return (
    <div className="chat-preview">
      <div className="chat-preview-header">
        <div className="chat-preview-avatar">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6H14L10.5 9L12 13.5L8 11L4 13.5L5.5 9L2 6H6.5L8 1.5Z" fill="#14100a"/></svg>
        </div>
        <div className="chat-preview-info">
          <div className="chat-preview-name">Planeswalker AI</div>
          <div className="chat-preview-status">● Online</div>
        </div>
        <span className="chat-preview-format">Commander</span>
      </div>
      <div className="chat-preview-messages">
        <div className="chat-preview-user-row">
          <div className="chat-preview-user-msg">Build me a Nethroi graveyard recursion deck</div>
        </div>
        <div className="chat-preview-ai-row">
          <div className="chat-preview-ai-avatar">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6H14L10.5 9L12 13.5L8 11L4 13.5L5.5 9L2 6H6.5L8 1.5Z" fill="#14100a"/></svg>
          </div>
          <div className="chat-preview-ai-body">
            <div className="chat-preview-ai-bubble">Perfect. Nethroi excels at recursion with total power ≤10. Here are 3 key synergy cards:</div>
            <div className="chat-preview-cards">
              <div className="chat-preview-card">
                <img src="https://cards.scryfall.io/art_crop/front/4/f/4fe22cd8-31e6-491b-bce2-db257668eb92.jpg" alt="" className="chat-preview-card-art" />
                <div className="chat-preview-card-info">
                  <div className="chat-preview-card-name">Eternal Witness</div>
                  <div className="chat-preview-card-meta">Recursion engine · CMC 3</div>
                </div>
                <span className="chat-preview-card-synergy">95%</span>
              </div>
              <div className="chat-preview-card">
                <img src="https://cards.scryfall.io/art_crop/front/f/a/fa553e54-e6aa-499b-ac48-0cdbf6c37734.jpg" alt="" className="chat-preview-card-art" />
                <div className="chat-preview-card-info">
                  <div className="chat-preview-card-name">Viscera Seer</div>
                  <div className="chat-preview-card-meta">Sacrifice outlet · CMC 1</div>
                </div>
                <span className="chat-preview-card-synergy">93%</span>
              </div>
              <div className="chat-preview-card chat-preview-card-loading">
                <div className="chat-preview-card-art-placeholder"><div className="chat-preview-blink" /></div>
                <div className="chat-preview-card-meta" style={{ fontStyle: "italic" }}>Generating 10 more suggestions...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="chat-preview-input">
        <div className="chat-preview-input-text">Describe your deck idea...</div>
        <button className="chat-preview-send">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8h12M9 3l5 5-5 5"/></svg>
        </button>
      </div>
    </div>
  );
}

export default function MyDecks({ decks, signedIn, cloud, onSave, onDelete, onOpen, onPlaytest, onNewDeck, onGuidedBuild, notify, refresh, setTab, decksIntent, onIntentConsumed }) {
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
      const cmdrName = commander.split(" && ")[0];
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
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"1 Sol Ring\n..."} />
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
                  placeholder="Search decks..."
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

          {/* Deck hero grid — New Deck tile leads (Archidekt-style) */}
          <div className="hero-grid">
            {onNewDeck && (
              <div className="deck-card-new" onClick={onNewDeck} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNewDeck(); } }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem", lineHeight: 1, color: "var(--muted)" }}>+</div>
                  <div style={{ fontSize: ".7rem", marginTop: ".3rem", color: "var(--muted)" }}>New Deck</div>
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
