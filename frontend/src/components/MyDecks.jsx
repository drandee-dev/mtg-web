import { useEffect, useState } from "react";
import { api, disassembleDecklist, getCardImage, FORMATS } from "../lib/api";

function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const WUBRG_COLORS = ["W", "U", "B", "R", "G"];

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
            {colors.length > 0 && (
              <span className="deck-hero-pips">
                {WUBRG_COLORS.filter((c) => colors.includes(c)).map((c) => (
                  <span key={c} className={`pip pip-${c}`}>{c}</span>
                ))}
              </span>
            )}
            {meta?.bracket != null && (
              <span className="deck-hero-bracket">Bracket {meta.bracket}</span>
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

export default function MyDecks({ decks, signedIn, cloud, onSave, onDelete, onOpen, onNewDeck, onGuidedBuild, notify, refresh }) {
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importFormat, setImportFormat] = useState("commander");
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deckMeta, setDeckMeta] = useState({});

  // Resolve commander art + colors for each deck
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
        download(`${deck.name || "deck"}.txt`, text);
      } catch (e) {
        notify(`Export failed: ${e.message}`);
      }
    } else {
      const payload = { name: deck.name, format: deck.format, decklist_text: deck.decklist_text };
      download(`${deck.name || "deck"}.json`, JSON.stringify(payload, null, 2), "application/json");
    }
  }

  async function rename(deck) {
    const name = prompt("Rename deck:", deck.name);
    if (name && name !== deck.name) await onSave({ ...deck, name });
  }

  return (
    <div>
      {/* Header row */}
      <div className="spread" style={{ margin: ".5rem 0 1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>My Decks</h2>
          <span className="muted small">{cloud ? "Cloud-synced" : "This device"}</span>
        </div>
        <div className="row" style={{ gap: ".4rem" }}>
          {onNewDeck && <button className="primary" onClick={onNewDeck}>+ New Deck</button>}
          {onGuidedBuild && (
            <button className="ghost small" onClick={onGuidedBuild} style={{ borderColor: "var(--accent)" }}>
              ✨ Guided Build
            </button>
          )}
          <button className="ghost small" onClick={() => setShowImport(!showImport)}>Import</button>
          <button className="ghost small" onClick={refresh}>Refresh</button>
        </div>
      </div>

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

      {/* Hero portrait grid */}
      {decks.length === 0 && !showImport && (
        <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <p className="muted">No decks yet.</p>
          <p className="muted small">Create a new deck, use Guided Build, or import one to get started.</p>
          {onGuidedBuild && (
            <button className="primary" onClick={onGuidedBuild} style={{ marginTop: ".75rem" }}>
              ✨ Guided Build
            </button>
          )}
        </div>
      )}

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
        {decks.length > 0 && onNewDeck && (
          <div className="deck-hero deck-hero-new" onClick={onNewDeck} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNewDeck(); } }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", lineHeight: 1 }}>+</div>
              <div style={{ fontSize: ".8rem", marginTop: ".3rem", color: "var(--muted)" }}>New Deck</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
