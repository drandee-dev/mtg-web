// New decks whose save failed, kept in this browser (lib/kept): one row each,
// on the New deck screen and Decks home, until saved or discarded. `busy` on an
// entry is App's: a try still out, wherever it was pressed.
export default function KeptDecks({ kept, onRetry, onDiscard }) {
  if (!kept?.length) return null;
  return (
    <div className="kept-decks">
      {kept.map((entry) => (
        <div key={entry.id} className="dh-notice" role="status">
          <span className="dh-notice-text">
            <strong>“{entry.deck.name}”</strong> isn’t saved yet. It’s kept in this browser until it saves or you discard it.
          </span>
          <span className="dh-notice-actions">
            <button className="primary" onClick={() => onRetry(entry)} disabled={entry.busy}>
              {entry.busy ? "Saving…" : "Try again"}
            </button>
            <button className="ghost" onClick={() => onDiscard(entry)} disabled={entry.busy}>Discard</button>
          </span>
        </div>
      ))}
    </div>
  );
}
