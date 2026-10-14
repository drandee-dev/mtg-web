import { useState } from "react";

// New decks whose save failed, kept in this browser (lib/kept): one row each,
// on the New deck screen and Decks home, until saved or discarded.
export default function KeptDecks({ kept, onRetry, onDiscard }) {
  const [busy, setBusy] = useState(null);
  if (!kept?.length) return null;

  async function retry(entry) {
    setBusy(entry.id);
    try { await onRetry(entry); } finally { setBusy(null); }
  }

  return (
    <div className="kept-decks">
      {kept.map((entry) => (
        <div key={entry.id} className="dh-notice" role="status">
          <span className="dh-notice-text">
            <strong>“{entry.deck.name}”</strong> isn’t saved yet. It’s kept in this browser until it saves or you discard it.
          </span>
          <span className="dh-notice-actions">
            <button className="primary" onClick={() => retry(entry)} disabled={busy === entry.id}>
              {busy === entry.id ? "Saving…" : "Try again"}
            </button>
            <button className="ghost" onClick={() => onDiscard(entry)} disabled={busy === entry.id}>Discard</button>
          </span>
        </div>
      ))}
    </div>
  );
}
