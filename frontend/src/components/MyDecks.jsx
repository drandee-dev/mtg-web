import { useEffect, useState } from "react";
import { api, disassembleDecklist, getCardImage, FORMATS } from "../lib/api";
import { downloadFile } from "../lib/hooks";

const WUBRG_COLORS = ["W", "U", "B", "R", "G"];

const HERO_ART = "https://cards.scryfall.io/art_crop/front/8/a/8a2813cb-c73c-4a50-b278-2f13deb71773.jpg";


function DeckHero({ deck, meta, onOpen, onDelete, onRename, onExport, notify }) {
  const art = meta?.art_crop;
  const colors = meta?.color_identity || [];

  return (
    <div className="deck-hero-wrap">
      <div className="deck-hero" onClick={() => onOpen(deck)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(deck); } }}
        aria-label={`Open ${deck.name}`}>
        {art ? (
          <img src={art} alt="" loading="lazy" />
        ) : (
          <div className="deck-hero-placeholder" />
        )}
        <div className="deck-hero-overlay">
          <div className="deck-hero-name">{deck.name}</div>
          <div className="deck-hero-meta">
            <span className="deck-hero-format">
              {(deck.format || "commander").replace(/^\w/, (c) => c.toUpperCase())}
              {meta?.bracket != null ? ` · B${meta.bracket}` : ""}
            </span>
            {colors.length > 0 && (
              <span className="deck-hero-pips deck-hero-pips-desktop">
                {WUBRG_COLORS.filter((c) => colors.includes(c)).map((c) => (
                  <span key={c} className={`pip pip-${c}`}>{c}</span>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="deck-hero-actions">
        <button className="ghost small" onClick={() => onRename(deck)}>Rename</button>
        <select className="ghost small" style={{ width: "auto", padding: ".1rem .3rem", fontSize: ".75rem" }}
          defaultValue="" onChange={(e) => { if (e.target.value) onExport(deck, e.target.value); e.target.value = ""; }}>
          <option value="" disabled>Export</option>
          <option value="txt">.txt</option>
          <option value="json">.json</option>
        </select>
        <button className="ghost small btn-danger" onClick={() => onDelete(deck.id)}>Delete</button>
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
            <button className="landing-chip" onClick={onShowImport}>
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
          <div className="landing-sec-cta" onClick={onShowImport}>
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

export default function MyDecks({ decks, signedIn, cloud, onSave, onDelete, onOpen, onNewDeck, onGuidedBuild, notify, refresh, setTab }) {
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importFormat, setImportFormat] = useState("commander");
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deckMeta, setDeckMeta] = useState({});
  const [deckSearch, setDeckSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const meta = {};
      for (const deck of decks) {
        const { commander } = disassembleDecklist(deck.decklist_text);
        if (!commander) continue;
        const cmdrName = commander.split(" && ")[0];
        try {
          const data = await getCardImage(cmdrName);
          if (data?.found) {
            meta[deck.id] = {
              art_crop: data.art_crop,
              color_identity: data.color_identity,
              bracket: null,
            };
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setDeckMeta(meta);
    }
    resolve();
    return () => { cancelled = true; };
  }, [decks]);

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

  async function exportDeck(deck, format) {
    if (format === "txt") {
      try {
        const { text } = await api.exportText(deck.decklist_text, deck.format);
        downloadFile(`${deck.name || "deck"}.txt`, text);
      } catch (e) {
        notify(`Export failed: ${e.message}`);
      }
    } else {
      const payload = { name: deck.name, format: deck.format, decklist_text: deck.decklist_text };
      downloadFile(`${deck.name || "deck"}.json`, JSON.stringify(payload, null, 2), "application/json");
    }
  }

  async function rename(deck) {
    const name = prompt("Rename deck:", deck.name);
    if (name && name !== deck.name) await onSave({ ...deck, name });
  }

  return (
    <div>
      {/* Import panel (collapsible) */}
      {showImport && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3>Import a deck</h3>
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

          {/* Deck hero grid */}
          <div className="hero-grid">
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
                onDelete={onDelete}
                onRename={rename}
                onExport={exportDeck}
                notify={notify}
              />
            ))}
            {onNewDeck && (
              <div className="deck-hero deck-hero-new" onClick={onNewDeck} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNewDeck(); } }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem", lineHeight: 1, color: "var(--muted)" }}>+</div>
                  <div style={{ fontSize: ".7rem", marginTop: ".3rem", color: "var(--muted)" }}>New Deck</div>
                </div>
              </div>
            )}
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
