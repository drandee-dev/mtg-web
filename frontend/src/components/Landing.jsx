// The logged-out / no-decks landing surface, lifted out of MyDecks.jsx so the
// deck library and the front door stop sharing a 690-line file. UrlImportInline
// is exported because MyDecks still uses it in the returning-user toolbar.
import { useRef, useState } from "react";
import { useCardImage } from "../lib/hooks";

const HERO_ART = "https://cards.scryfall.io/art_crop/front/8/a/8a2813cb-c73c-4a50-b278-2f13deb71773.jpg";

// A curated six rather than the top six by EDHREC rank, because ranking them
// means loading the whole commander directory: ~505KB over the wire even after
// Vercel's brotli (2.4MB uncompressed). That is far too much to spend on six
// tiles above the fold. Each tile resolves its own art through the same cached
// per-card lookup the rest of the app uses. Slugs verified against the
// directory, so none of these dead-end.
const TEASER_COMMANDERS = [
  { name: "Atraxa, Praetors' Voice", slug: "atraxa-praetors-voice", tag: "Superfriends" },
  { name: "Krenko, Mob Boss", slug: "krenko-mob-boss", tag: "Goblin tokens" },
  { name: "Muldrotha, the Gravetide", slug: "muldrotha-the-gravetide", tag: "Graveyard value" },
  { name: "Isshin, Two Heavens as One", slug: "isshin-two-heavens-as-one", tag: "Combat triggers" },
  { name: "Edgar Markov", slug: "edgar-markov", tag: "Vampire aggro" },
  { name: "Miirym, Sentinel Wyrm", slug: "miirym-sentinel-wyrm", tag: "Dragon tribal" },
];

function TeaserTile({ entry, onOpen }) {
  const data = useCardImage(entry.name);
  const img = data?.art_crop || data?.image || null;
  return (
    <button type="button" className="teaser-tile" onClick={() => onOpen?.(entry.slug)}>
      <span className="teaser-tile-art">
        {img && <img src={img} alt="" loading="lazy" />}
      </span>
      <span className="teaser-tile-name">{entry.name.split(",")[0]}</span>
      <span className="teaser-tile-tag">{entry.tag}</span>
    </button>
  );
}

/** "Discover" band. Shared by both landings: the new-user one and the deck library. */
export function CommanderTeaser({ onOpenCommander, onBrowseAll }) {
  return (
    <section className="panel landing-band">
      <div className="spread" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: ".5rem" }}>
        <div>
          <div className="band-eyebrow">Discover</div>
          <h2 className="band-title">Start from a commander</h2>
          <p className="muted small band-sub">
            Every legal commander, with its signature cards and every printing.
          </p>
        </div>
        {onBrowseAll && (
          <button type="button" className="ghost small" onClick={onBrowseAll}>
            Browse all →
          </button>
        )}
      </div>
      <div className="teaser-row">
        {TEASER_COMMANDERS.map((e) => (
          <TeaserTile key={e.slug} entry={e} onOpen={onOpenCommander} />
        ))}
      </div>
    </section>
  );
}

export function UrlImportInline({ onImport, busy }) {
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

export default function NewUserLanding({ onNewDeck, onGuidedBuild, onShowImport, onImportUrl, busy, onOpenCommander, onBrowseCommanders }) {
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
              <div className="landing-mini-ai-text">Found 12 synergy cards — <span style={{ color: "var(--good)" }}>Eternal Witness</span>, <span style={{ color: "var(--good)" }}>Viscera Seer</span>…</div>
            </div>
          </div>
          <button className="landing-start-btn" onClick={onGuidedBuild}>Start Building →</button>
        </div>

        {/* Or start another way */}
        <div className="landing-or-label">Or start another way</div>

        {/* 3 secondary CTAs */}
        <div className="landing-secondary-ctas">
          <div className="landing-sec-cta" onClick={() => urlInputRef.current?.focus()} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); urlInputRef.current?.focus(); } }}>
            <div className="landing-sec-icon" style={{ background: "rgba(124,172,248,.1)" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#7cacf8" strokeWidth="1.5" strokeLinecap="round"><path d="M6 9.5a3.5 3.5 0 0 0 4.95 0l1.75-1.75a3.5 3.5 0 0 0-4.95-4.95L6.4 4.2"/><path d="M10 6.5a3.5 3.5 0 0 0-4.95 0L3.3 8.25a3.5 3.5 0 0 0 4.95 4.95L9.6 11.8"/></svg>
            </div>
            <div className="landing-sec-name">Import URL</div>
            <div className="landing-sec-sub">Archidekt · Moxfield</div>
          </div>
          <div className="landing-sec-cta" onClick={onShowImport} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onShowImport(); } }}>
            <div className="landing-sec-icon" style={{ background: "rgba(61,206,138,.08)" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#3dce8a" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h10M3 8h10M3 11h6"/></svg>
            </div>
            <div className="landing-sec-name">Paste List</div>
            <div className="landing-sec-sub">Any format</div>
          </div>
          <div className="landing-sec-cta" onClick={onGuidedBuild} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGuidedBuild(); } }}>
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

      {/* A second thing to do. The hero already carries five entry points, so
          this band deliberately is not more doors — it is the other way in:
          browse, and start from a commander instead of from a blank deck. */}
      <CommanderTeaser onOpenCommander={onOpenCommander} onBrowseAll={onBrowseCommanders} />
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
                <div className="chat-preview-card-meta" style={{ fontStyle: "italic" }}>Generating 10 more suggestions…</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="chat-preview-input">
        <div className="chat-preview-input-text">Describe your deck idea…</div>
        <button className="chat-preview-send">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8h12M9 3l5 5-5 5"/></svg>
        </button>
      </div>
    </div>
  );
}
