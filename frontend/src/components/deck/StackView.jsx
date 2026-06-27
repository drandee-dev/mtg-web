import { useState } from "react";
import { canHover, useCardImage } from "../../lib/hooks";

// Archidekt-style stacked columns: cards in each type group overlap vertically,
// showing only a ~36px name strip until hovered (desktop) or tapped (touch).
export default function StackView({ groups, onCardClick, synergyMap = {} }) {
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
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StackCard({ name, qty, synergy, onCardClick }) {
  const data = useCardImage(name);
  const img = data?.image || data?.art_crop || null;
  const [expanded, setExpanded] = useState(false);

  function handleClick() {
    // Desktop reveals on hover; touch reveals on first tap, opens preview on second.
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
    </div>
  );
}
