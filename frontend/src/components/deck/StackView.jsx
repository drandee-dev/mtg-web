import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { canHover, useCardImage } from "../../lib/hooks";
import { useColumnCount, packMasonry } from "../../lib/masonry";
import StackColumn from "./StackColumn";
import StackDndContext from "./StackDndContext";
import CardActionRail from "./CardActionRail";
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

// Cap the picked-up-stack ghost so a 30-card column doesn't render a 1400px ghost.
const GHOST_MAX_CARDS = 6;

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
  onSetQty,
  commanderColumn = null,
  onChangeCommander,
}) {
  const [containerRef, columnCount] = useColumnCount(200, 11.2);
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
                columnLabel="Commander"
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
          onColumnNudge={onColumnNudge}
          canMoveLeft={i > 0}
          canMoveRight={i < groups.length - 1}
          className="stack-column-image"
          dragData={{ type: "column", label, cards }}
        >
          <div className="stack-cards">
            {cards.map((c) => (
              <StackCard
                key={c.name}
                name={c.name}
                qty={c.qty}
                synergy={synergyMap[c.name]}
                columnLabel={label}
                onCardClick={onCardClick}
                onRemove={onRemove}
                onConsider={onConsider}
                onSetQty={onSetQty}
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

  // Don't make more columns than there are categories — empty buckets would render
  // dead space. Fewer columns then flex-grow to fill the width (see .stack-masonry-col).
  const cols = Math.max(1, Math.min(columnCount, items.length));
  const buckets = packMasonry(items, cols);

  return (
    <StackDndContext onColumnReorder={onColumnReorder} onCardMove={onCardMove} renderGhost={renderImageGhost}>
      <div ref={containerRef} className={`stack-view ${canHover ? "" : "stack-touch"}`}>
        {buckets.map((bucket, i) => (
          <div className="stack-masonry-col" key={i}>
            {bucket.map((item) => <div key={item.key}>{item.node}</div>)}
          </div>
        ))}
      </div>
    </StackDndContext>
  );
}

// ── Drag ghosts (image view) ──────────────────────────────────────────────────
function renderImageGhost(active) {
  if (active.type === "column") return <ColumnImageGhost cards={active.cards} />;
  if (active.type === "card") return <CardImageGhost name={active.name} />;
  return null;
}

function GhostCardImg({ name }) {
  const data = useCardImage(name);
  const img = data?.image || data?.art_crop || null;
  return (
    <div className="stack-card-wrap">
      {img ? <img src={img} alt="" /> : <div className="card-thumb-placeholder">{name}</div>}
    </div>
  );
}

function ColumnImageGhost({ cards }) {
  const shown = cards.slice(0, GHOST_MAX_CARDS);
  return (
    <div className="stack-drag-ghost">
      <div className="stack-cards">
        {shown.map((c) => <GhostCardImg key={c.name} name={c.name} />)}
      </div>
    </div>
  );
}

function CardImageGhost({ name }) {
  return (
    <div className="stack-drag-ghost">
      <div className="stack-cards">
        <GhostCardImg name={name} />
      </div>
    </div>
  );
}

function StackCard({ name, qty, synergy, columnLabel, onCardClick, onRemove, onConsider, onSetQty, cardDragEnabled, moveTargets, onCardMove }) {
  const data = useCardImage(name);
  const img = data?.image || data?.art_crop || null;
  const [expanded, setExpanded] = useState(false);

  // Card move (drag to another category) is role-mode + pointer only. On touch,
  // offer a ⋯ "move to" menu instead.
  const dragDisabled = !cardDragEnabled || !canHover;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `card:${columnLabel}:${name}`,
    data: { type: "card", name, columnLabel },
    disabled: dragDisabled,
  });

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
      ref={setNodeRef}
      className={`stack-card-wrap ${isDragging ? "stack-card-dragging" : ""}`}
      role="listitem"
      tabIndex={0}
      style={{
        ...(expanded ? { marginBottom: 8, zIndex: 10 } : undefined),
        ...(dragDisabled ? undefined : { touchAction: "none" }),
      }}
      {...(dragDisabled ? {} : listeners)}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCardClick?.(name); } }}
      aria-label={`${qty}x ${name}`}
    >
      {img ? (
        <img src={img} alt={`${qty}x ${name}`} loading="lazy" />
      ) : (
        <div className="card-thumb-placeholder">{name}</div>
      )}
      {(qty > 1 || onSetQty) && <span className="stack-card-qty">{qty}</span>}
      {synergy != null && <span className="stack-card-synergy">{Math.round(synergy * 100)}%</span>}
      {showMoveMenu && (
        <div className="stack-card-movemenu" onClick={(e) => e.stopPropagation()}>
          <MoreMenu items={moveItems} label={`Move ${name} to another category`} />
        </div>
      )}
      {canHover && (
        <CardActionRail name={name} qty={qty} onSetQty={onSetQty} onRemove={onRemove} onConsider={onConsider} />
      )}
    </div>
  );
}
