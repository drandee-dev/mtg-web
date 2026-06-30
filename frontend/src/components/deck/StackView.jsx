import { useState } from "react";
import { canHover, useCardImage } from "../../lib/hooks";
import { useColumnCount, packMasonry } from "../../lib/masonry";
import StackColumn from "./StackColumn";
import MoreMenu from "./MoreMenu";

function columnTotals(cards, metaMap) {
  let qty = 0;
  let price = 0;
  for (const c of cards) {
    qty += c.qty;
    const p = metaMap?.[c.name]?.price_usd;
    if (p != null) price += p * c.qty;
  }
  return { qty, price };
}

// Header + first full card + a sliver per additional overlapped card. Only used to
// rank columns by estimated height for masonry bucketing — doesn't need to be exact.
const HEADER_H = 34;
const CARD_H = 293;
const OVERLAP_SLIVER = 40;
function estimateColHeight(cardCount) {
  return HEADER_H + CARD_H + Math.max(0, cardCount - 1) * OVERLAP_SLIVER;
}

export default function StackView({
  groups,
  metaMap = {},
  onCardClick,
  onRemove,
  onConsider,
  synergyMap = {},
  cardDragEnabled = false,
  onColumnReorder,
  onColumnNudge,
  onCardMove,
  commanderColumn = null,
  onChangeCommander,
}) {
  const [containerRef, columnCount] = useColumnCount(210, 11.2);
  const labels = groups.map(([label]) => label);

  const items = [];
  if (commanderColumn && commanderColumn.length > 0) {
    const cmdrPrice = commanderColumn.reduce((sum, c) => sum + (metaMap?.[c.name]?.price_usd || 0), 0);
    items.push({
      key: "__commander__",
      estimatedHeight: estimateColHeight(commanderColumn.length),
      node: (
        <StackColumn
          label="Commander"
          isCommander
          count={commanderColumn.length}
          price={cmdrPrice}
          className="stack-column-image"
          menuItems={onChangeCommander ? [{ label: "Change commander", onClick: onChangeCommander }] : null}
        >
          <div className="stack-cards">
            {commanderColumn.map((c) => (
              <StackCard
                key={c.name}
                name={c.name}
                qty={c.qty}
                onCardClick={onCardClick}
                onRemove={null}
                onConsider={null}
                cardDragEnabled={false}
                moveTargets={null}
              />
            ))}
          </div>
        </StackColumn>
      ),
    });
  }

  groups.forEach(([label, cards], i) => {
    const { qty, price } = columnTotals(cards, metaMap);
    const moveTargets = labels.filter((l) => l !== label);
    items.push({
      key: label,
      estimatedHeight: estimateColHeight(cards.length),
      node: (
        <StackColumn
          label={label}
          count={qty}
          price={price}
          cardDragEnabled={cardDragEnabled}
          onColumnReorder={onColumnReorder}
          onCardMove={onCardMove}
          onColumnNudge={onColumnNudge}
          canMoveLeft={i > 0}
          canMoveRight={i < groups.length - 1}
          className="stack-column-image"
        >
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
                cardDragEnabled={cardDragEnabled}
                moveTargets={cardDragEnabled ? moveTargets : null}
                onCardMove={onCardMove}
              />
            ))}
          </div>
        </StackColumn>
      ),
    });
  });

  const buckets = packMasonry(items, columnCount);

  return (
    <div ref={containerRef} className={`stack-view ${canHover ? "" : "stack-touch"}`}>
      {buckets.map((bucket, i) => (
        <div className="stack-masonry-col" key={i}>
          {bucket.map((item) => <div key={item.key}>{item.node}</div>)}
        </div>
      ))}
    </div>
  );
}

function StackCard({ name, qty, synergy, onCardClick, onRemove, onConsider, cardDragEnabled, moveTargets, onCardMove }) {
  const data = useCardImage(name);
  const img = data?.image || data?.art_crop || null;
  const [expanded, setExpanded] = useState(false);
  // Drag is pointer-only; on touch, offer a ⋯ "move to" menu instead.
  const showMoveMenu = !canHover && moveTargets && moveTargets.length > 0;
  const moveItems = showMoveMenu
    ? moveTargets.map((t) => ({ label: `Move to ${t}`, onClick: () => onCardMove?.(name, t) }))
    : [];

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
      draggable={cardDragEnabled && canHover}
      onDragStart={cardDragEnabled && canHover ? (e) => {
        e.dataTransfer.setData("text/plain", `card:${name}`);
        e.dataTransfer.effectAllowed = "move";
      } : undefined}
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
      {showMoveMenu && (
        <div className="stack-card-movemenu" onClick={(e) => e.stopPropagation()}>
          <MoreMenu items={moveItems} label={`Move ${name} to another category`} />
        </div>
      )}
      {onRemove && (
        <button className="card-corner-remove" onClick={(e) => { e.stopPropagation(); onRemove(name); }}
          aria-label={`Remove ${name} from deck`}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4L4 12"/></svg>
        </button>
      )}
      {canHover && (
        <div className="card-hover-overlay">
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
