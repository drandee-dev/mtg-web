import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../../lib/hooks";

/** Import-cards modal with two tabs: paste a decklist, or import from a
 * Moxfield/Archidekt URL. `open` is falsy or the initial tab ("paste" | "url").
 * Import handlers are async; the modal shows a busy state and closes on success
 * (handlers throw on failure so input isn't lost).
 */
export default function ImportCardsModal({ open, onClose, onImportText, onImportUrl }) {
  if (!open) return null;
  // key remounts the inner form whenever the modal (re)opens on a different tab,
  // so state resets without effect-driven setState.
  return (
    <ModalInner
      key={open}
      initialTab={open === "url" ? "url" : "paste"}
      onClose={onClose}
      onImportText={onImportText}
      onImportUrl={onImportUrl}
    />
  );
}

function ModalInner({ initialTab, onClose, onImportText, onImportUrl }) {
  const [tab, setTab] = useState(initialTab);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const focusRef = useRef(null);
  const panelRef = useFocusTrap(true);

  useEffect(() => {
    focusRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function doImport() {
    if (busy) return;
    setBusy(true);
    try {
      if (tab === "paste") await onImportText(text);
      else await onImportUrl(url);
      onClose();
    } catch {
      // handler already notified; keep the modal open so input isn't lost
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="icm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="icm-panel" role="dialog" aria-modal="true" aria-label="Import cards" ref={panelRef} tabIndex={-1}>
        <div className="icm-head">
          <h3>Import cards</h3>
          <button className="icm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="icm-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "paste"} className={tab === "paste" ? "on" : ""} onClick={() => setTab("paste")}>
            Paste decklist
          </button>
          <button role="tab" aria-selected={tab === "url"} className={tab === "url" ? "on" : ""} onClick={() => setTab("url")}>
            From URL
          </button>
        </div>
        <div className="icm-body">
          {tab === "paste" ? (
            <>
              <textarea
                ref={focusRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"1 Nethroi, Apex of Death\n1 Sol Ring\n1 Birds of Paradise\n…"}
                aria-label="Decklist text"
              />
              <div className="icm-hint">
                Accepts Arena exports, Moxfield / Archidekt text, or plain “1 Card Name” lines.
              </div>
            </>
          ) : (
            <>
              <input
                ref={focusRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doImport(); }}
                placeholder="https://archidekt.com/decks/… or https://moxfield.com/decks/…"
                aria-label="Deck URL"
              />
              <div className="icm-srcs">
                <span className="icm-src">Archidekt</span>
                <span className="icm-src">Moxfield</span>
              </div>
              <div className="icm-hint">Deck must be public. Name and format import automatically.</div>
            </>
          )}
        </div>
        <div className="icm-foot">
          <button className="ghost small" onClick={onClose}>Cancel</button>
          <button
            className="primary small"
            disabled={busy || (tab === "paste" ? !text.trim() : !url.trim())}
            onClick={doImport}
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
