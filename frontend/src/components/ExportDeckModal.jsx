import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { downloadFile } from "../lib/hooks";

/** Export modal (Archidekt-style): shows the normalized decklist text so it can
 * be copied straight into Archidekt / Moxfield's importer, or downloaded as a
 * .txt / .json file. `deck` is the deck to export, or null when closed.
 */
export default function ExportDeckModal({ deck, onClose, notify }) {
  if (!deck) return null;
  return <ModalInner key={deck.id} deck={deck} onClose={onClose} notify={notify} />;
}

function ModalInner({ deck, onClose, notify }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.exportText(deck.decklist_text, deck.format);
        if (!cancelled) setText(res.text || deck.decklist_text || "");
      } catch {
        // fall back to the raw stored list — still paste-able
        if (!cancelled) setText(deck.decklist_text || "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [deck]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copy() {
    navigator.clipboard.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => notify?.("Could not copy to clipboard."),
    );
  }

  function downloadTxt() {
    downloadFile(`${deck.name || "deck"}.txt`, text);
  }

  function downloadJson() {
    const payload = { name: deck.name, format: deck.format, decklist_text: deck.decklist_text };
    downloadFile(`${deck.name || "deck"}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  return (
    <div className="edm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edm-panel" role="dialog" aria-modal="true" aria-label={`Export ${deck.name}`}>
        <div className="edm-head">
          <h3>Export deck</h3>
          <button className="edm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="edm-body">
          <textarea
            readOnly
            value={loading ? "Loading…" : text}
            aria-label="Decklist text"
            onFocus={(e) => e.target.select()}
          />
          <div className="edm-hint">
            Copy and paste into Archidekt or Moxfield&rsquo;s deck importer, or download a file.
          </div>
        </div>
        <div className="edm-foot">
          <button className="ghost small" onClick={downloadTxt} disabled={loading}>Download .txt</button>
          <button className="ghost small" onClick={downloadJson}>Download .json</button>
          <button className="primary small" onClick={copy} disabled={loading}>
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
