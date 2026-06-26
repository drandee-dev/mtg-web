import { useEffect, useState } from "react";
import { api, disassembleDecklist, getCardImage, FORMATS } from "../lib/api";
import { downloadFile } from "../lib/hooks";

const WUBRG_COLORS = ["W", "U", "B", "R", "G"];

const HERO_ART = "https://cards.scryfall.io/art_crop/front/8/a/8a2813cb-c73c-4a50-b278-2f13deb71773.jpg";

const FEATURE_CARDS = [
  {
    id: "deck", icon: "\u{1F0CF}", title: "Analyze & Build",
    desc: "Paste a decklist to see mana curve, pricing & legality. Or use the AI wizard to build from scratch with EDHREC data.",
    color: "#7cacf8", label: "Open →",
    art: "https://cards.scryfall.io/art_crop/front/5/6/5662d0a5-3222-4ab9-9e15-f06477730b75.jpg",
  },
  {
    id: "rules", icon: "📖", title: "Rules & Rulings",
    desc: "Search the full Comprehensive Rules by rule number, keyword, or plain English. Ask the AI a rules question in natural language.",
    color: "#9a86b8", label: "Open →",
    art: "https://cards.scryfall.io/art_crop/front/d/d/dd6f76d4-a2b3-40e5-b6a7-b27c42caf615.jpg",
  },
  {
    id: "cards", icon: "🔍", title: "Card Search",
    desc: "Search every Magic card by name, type, color, CMC, or price. Add cards directly to any deck you’re building.",
    color: "#3dce8a", label: "Open →",
    art: "https://cards.scryfall.io/art_crop/front/b/a/ba48c787-a444-4e15-bab7-39994a6e23e7.jpg",
  },
  {
    id: null, icon: "✨", title: "AI Planeswalker",
    desc: "Your AI deckbuilding advisor. Ask anything about strategy, get card suggestions, explore combos — always in context of your deck.",
    color: "var(--accent)", label: "Open Chat →",
    gradient: "linear-gradient(90deg,#c98a3a 0%,#9a86b8 100%)",
    art: "https://cards.scryfall.io/art_crop/front/f/b/fbbd5627-2f55-4101-981b-49f5f45db578.jpg",
  },
];

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

function NewUserLanding({ onNewDeck, onGuidedBuild, setTab, onShowImport }) {
  return (
    <div>
      {/* Welcome hero */}
      <div className="welcome-hero">
        <img src={HERO_ART} alt="" className="welcome-hero-bg" />
        <div className="welcome-hero-gradient" />
        <div className="welcome-hero-content">
          <div className="welcome-pill">Welcome</div>
          <h1 className="welcome-title">Your MTG Command Center</h1>
          <p className="welcome-subtitle">
            Analyze decklists, build with AI guidance, look up rulings, and search every card ever printed — all in one place.
          </p>
          <div className="welcome-ctas">
            <button className="primary" onClick={onGuidedBuild}>
              ✨ Guided Build
            </button>
            <button className="ghost" onClick={onNewDeck} style={{ borderColor: "rgba(255,255,255,.13)", background: "rgba(255,255,255,.07)" }}>
              Analyze a Deck →
            </button>
            <button className="ghost" onClick={onShowImport}
              style={{ background: "none", border: "none", color: "var(--muted)", fontSize: ".75rem", padding: "0 4px" }}>
              Import a decklist
            </button>
          </div>
        </div>
      </div>

      {/* AI differentiator strip */}
      <div className="ai-strip">
        <div className="ai-strip-label">Why Workshop, not just Archidekt or Moxfield?</div>
        <div className="ai-strip-grid">
          <div className="ai-strip-item">
            <span className="ai-strip-icon">✨</span>
            <div><strong>AI explains every recommendation</strong><span className="muted"> — not just synergy numbers, but why a card belongs in your specific deck</span></div>
          </div>
          <div className="ai-strip-item">
            <span className="ai-strip-icon">📖</span>
            <div><strong>Plain-English rules Q&A</strong><span className="muted"> — ask &ldquo;can I counter a triggered ability?&rdquo; and get a sourced answer</span></div>
          </div>
          <div className="ai-strip-item">
            <span className="ai-strip-icon">🔗</span>
            <div><strong>Combo near-miss detection</strong><span className="muted"> — finds combos you&rsquo;re 1 card away from completing</span></div>
          </div>
          <div className="ai-strip-item">
            <span className="ai-strip-icon">⚠️</span>
            <div><strong>Deck weakness analysis</strong><span className="muted"> — automatically flags thin categories and suggests targeted fixes</span></div>
          </div>
        </div>
      </div>

      {/* Section label */}
      <div className="section-divider">
        <span>What can you do here?</span>
        <div className="section-divider-line" />
      </div>

      {/* Feature discovery grid */}
      <div className="feature-grid">
        {FEATURE_CARDS.map((fc) => (
          <div key={fc.title} className="feature-card"
            onClick={() => fc.id && setTab(fc.id)}
            style={{ cursor: fc.id ? "pointer" : "default" }}>
            <img src={fc.art} alt="" className="feature-card-bg" />
            <div className="feature-card-bar" style={{ background: fc.gradient || fc.color }} />
            <div className="feature-card-content">
              <div className="feature-card-icon">{fc.icon}</div>
              <div className="feature-card-title">{fc.title}</div>
              <div className="feature-card-desc">{fc.desc}</div>
              <span className="feature-card-link" style={{ color: fc.color }}>{fc.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Import hint footer */}
      <div className="import-hint">
        <span className="muted" style={{ fontSize: ".75rem" }}>Already have a saved deck? </span>
        <button onClick={onShowImport}
          style={{ background: "none", border: "none", color: "var(--accent)", fontSize: ".75rem", fontWeight: 600, cursor: "pointer", padding: "0 2px", textDecoration: "underline", minHeight: "auto" }}>
          Import a decklist →
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
          setTab={setTab}
          onShowImport={() => setShowImport(true)}
        />
      )}

      {/* Returning user */}
      {decks.length > 0 && (
        <>
          {/* Header row */}
          <div className="spread" style={{ margin: ".5rem 0 1rem", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-.02em" }}>My Decks</h2>
              <span className="muted small">{cloud ? "Cloud-synced" : "This device"} · {decks.length} deck{decks.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="row" style={{ gap: ".5rem" }}>
              {onGuidedBuild && (
                <button className="guided-build-btn" onClick={onGuidedBuild}
                  style={{ background: "transparent", border: "1px solid rgba(201,138,58,.45)", color: "var(--accent)", borderRadius: "var(--radius)", padding: ".45rem .85rem", fontSize: ".8rem", fontWeight: 600 }}>
                  ✨ Guided Build
                </button>
              )}
              {onNewDeck && <button className="primary" onClick={onNewDeck}>+ New Deck</button>}
            </div>
          </div>

          {/* Deck hero grid */}
          <div className="hero-grid">
            {decks.map((d) => (
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
