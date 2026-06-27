import { useState } from "react";
import { canHover, useCardImage } from "../../lib/hooks";

export default function StackView({ groups, onCardClick, onRemove, onConsider, synergyMap = {} }) {
  return (
    <div className="stack-view">
      {groups.map(([label, cards]) => {
        const count = cards.reduce((s, c) => s + c.qty, 0);
        return (
          <div className="stack-column" key={label}>
            <div className="stack-column-header">
              <span className="stack-column-label">{label}</span>
              <span className="stack-column-count">({count})</span>
            </div>
            <div className="stack-cards">
              {cards.map((c) => (
                <StackCard
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  synergy={synergyMap[c.name]}
                  onCardClick={onCardClick}
                  onRemove={onRemove}
                  onConsider={onConsider}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StackCard({ name, qty, synergy, onCardClick, onRemove, onConsider }) {
  const data = useCardImage(name);
  const img = data?.image || data?.art_crop || null;
  const [expanded, setExpanded] = useState(false);

  function handleClick() {
    if (canHover) { onCardClick?.(name); return; }
    if (expanded) { onCardClick?.(name); setExpanded(false); }
    else { setExpanded(true); }
  }

  return (
    <div
      className="stack-card-wrap"
      role="listitem"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCardClick?.(name); } }}
      aria-label={`${qty}x ${name}`}
      style={expanded ? { marginBottom: 8, zIndex: 10 } : undefined}
    >
      {img ? (
        <img src={img} alt={`${qty}x ${name}`} loading="lazy" />
      ) : (
        <div className="card-thumb-placeholder">{name}</div>
      )}
      {qty > 1 && <span className="stack-card-qty">{qty}</span>}
      {synergy != null && <span className="stack-card-synergy">{Math.round(synergy * 100)}%</span>}
      <div className="stack-card-name"><span>{name}</span></div>
      {canHover && (
        <div className="card-hover-overlay">
          {onRemove && (
            <button className="card-hover-btn card-hover-remove"
              onClick={(e) => { e.stopPropagation(); onRemove(name); }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4l8 8M12 4L4 12"/></svg>
              <span>Remove</span>
            </button>
          )}
          {onConsider && (
            <button className="card-hover-btn card-hover-consider"
              onClick={(e) => { e.stopPropagation(); onConsider(name); }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
              <span>Consider</span>
            </button>
          )}
          <button className="card-hover-btn card-hover-scryfall"
            onClick={(e) => { e.stopPropagation(); window.open(`https://scryfall.com/search?q=${encodeURIComponent(name)}`, "_blank", "noopener"); }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8A1.5 1.5 0 0 0 13 12.5V9"/><path d="M9.5 2H14v4.5"/><line x1="14" y1="2" x2="7.5" y2="8.5"/></svg>
            <span>Scryfall</span>
          </button>
        </div>
      )}
    </div>
  );
}
