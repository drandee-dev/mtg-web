import { useState } from "react";
import { api, FORMATS } from "../lib/api";

function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Saved decks. Backed by Supabase when signed in, else this browser's localStorage.
export default function MyDecks({ decks, signedIn, cloud, onSave, onDelete, onOpen, notify, refresh }) {
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importFormat, setImportFormat] = useState("commander");
  const [busy, setBusy] = useState(false);

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
        // Accept either a .json backup ({name,format,decklist_text}) or raw decklist text.
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
      } catch (err) {
        notify(`Could not read file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  async function exportText(deck) {
    try {
      const { text } = await api.exportText(deck.decklist_text, deck.format);
      download(`${deck.name || "deck"}.txt`, text);
    } catch (e) {
      notify(`Export failed: ${e.message}`);
    }
  }

  function exportJson(deck) {
    const payload = { name: deck.name, format: deck.format, decklist_text: deck.decklist_text };
    download(`${deck.name || "deck"}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  async function rename(deck) {
    const name = prompt("Rename deck:", deck.name);
    if (name && name !== deck.name) await onSave({ ...deck, name });
  }

  return (
    <div>
      <div className="panel">
        <div className="spread">
          <h2>My decks</h2>
          <span className="badge">{cloud ? "Cloud-synced" : "This device"}</span>
        </div>
        <p className="muted small">
          {cloud
            ? "Signed in — these decks sync across your devices."
            : signedIn === false
            ? "Saved on this device only. Sign in (Settings) to sync across devices, or use Export/Import to move them."
            : "Saved on this device only. Use Export/Import to move decks between devices."}
        </p>
        <button className="ghost small" onClick={refresh}>Refresh</button>
      </div>

      <div className="panel">
        <h3>Import a deck</h3>
        <p className="muted small">Paste from Archidekt / Moxfield / Arena, or load a file.</p>
        <div className="row">
          <input
            placeholder="Deck name"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            style={{ flex: "1 1 200px" }}
          />
          <select value={importFormat} onChange={(e) => setImportFormat(e.target.value)} style={{ width: "auto" }}>
            {FORMATS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"1 Sol Ring\n..."} />
        <div className="row" style={{ marginTop: ".5rem" }}>
          <button className="primary" onClick={doImport} disabled={busy}>Save imported deck</button>
          <label className="ghost" style={{ margin: 0 }}>
            <input type="file" accept=".txt,.json,.csv" onChange={onImportFile} style={{ display: "none" }} />
            <span className="badge" style={{ cursor: "pointer" }}>Load from file…</span>
          </label>
        </div>
      </div>

      <div className="panel">
        <h3>Saved ({decks.length})</h3>
        {decks.length === 0 && <p className="muted small">No saved decks yet.</p>}
        {decks.map((d) => (
          <div key={d.id} className="spread" style={{ borderTop: "1px solid var(--border)", padding: ".6rem 0" }}>
            <div>
              <strong>{d.name}</strong>
              <div className="muted small">{d.format}</div>
            </div>
            <div className="row">
              <button className="primary small" onClick={() => onOpen(d)}>Open</button>
              <button className="ghost small" onClick={() => rename(d)}>Rename</button>
              <button className="ghost small" onClick={() => exportText(d)}>Export .txt</button>
              <button className="ghost small" onClick={() => exportJson(d)}>Export .json</button>
              <button className="ghost small" onClick={() => onDelete(d.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
