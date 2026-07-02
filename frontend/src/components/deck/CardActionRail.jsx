// Archidekt-style vertical control rail on the right edge of a card (hover-revealed).
// Quantity stepper (+ adds a copy, − removes one / removes the card at 0) plus the
// quick actions (Considering, Scryfall). Replaces the old top-right ✕ and the bottom
// gradient overlay. `onPointerDown` is swallowed so dragging from a button doesn't
// start a dnd-kit card drag.
const scryfallUrl = (name) => `https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`;

export default function CardActionRail({ name, qty = 1, onSetQty, onRemove, onConsider }) {
  return (
    <div className="card-rail" onPointerDown={(e) => e.stopPropagation()}>
      {onSetQty && (
        <div className="card-rail-qty">
          <button
            className="card-rail-btn"
            title="Add one"
            aria-label={`Add a copy of ${name}`}
            onClick={(e) => { e.stopPropagation(); onSetQty(name, qty + 1); }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
          </button>
          <button
            className="card-rail-btn"
            title={qty <= 1 ? "Remove from deck" : "Remove one"}
            aria-label={qty <= 1 ? `Remove ${name} from deck` : `Remove a copy of ${name}`}
            onClick={(e) => { e.stopPropagation(); if (qty > 1) onSetQty(name, qty - 1); else onRemove?.(name); }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 8h10"/></svg>
          </button>
        </div>
      )}
      {onConsider && (
        <button
          className="card-rail-btn card-rail-action"
          title="Add to Considering"
          aria-label={`Move ${name} to Considering`}
          onClick={(e) => { e.stopPropagation(); onConsider(name); }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l1.6 3.7 4 .4-3 2.7.9 4L8 11.4 4.5 12.8l.9-4-3-2.7 4-.4z"/></svg>
        </button>
      )}
      <button
        className="card-rail-btn card-rail-action"
        title="View on Scryfall"
        aria-label={`Open ${name} on Scryfall`}
        onClick={(e) => { e.stopPropagation(); window.open(scryfallUrl(name), "_blank", "noopener"); }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M7 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8A1.5 1.5 0 0 0 13 12.5V9"/><path d="M9.5 2H14v4.5"/><line x1="14" y1="2" x2="7.5" y2="8.5"/></svg>
      </button>
    </div>
  );
}
