import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useCanHover, useCardImage } from "../../lib/hooks";
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
const CARD_H = 335;
const OVERLAP_SLIVER = 46;
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
  consideringColumn = null,
  consideringMenu = null,
  landSuffix = null,
}) {
  const canHover = useCanHover();
  const [containerRef, columnCount] = useColumnCount(15, 0.7); // rem — matches .stack-card-wrap width + .stack-view gap
  const labels = groups.map(([label]) => label);
  // Touch: one expanded card at a time across ALL columns — expanding a card
  // shrinks whichever was previously pulled out of its stack.
  const [expandedCard, setExpandedCard] = useState(null);

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
                printing={c.printing}
                columnLabel="Commander"
                onCardClick={onCardClick}
                onRemove={null}
                onConsider={null}
                cardDragEnabled={false}
                moveTargets={null}
                expandedCard={expandedCard}
                setExpandedCard={setExpandedCard}
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
          countSuffix={landSuffix?.(label) || null}
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
                printing={c.printing}
                synergy={synergyMap[c.name]}
                columnLabel={label}
                onCardClick={onCardClick}
                onRemove={onRemove}
                onConsider={onConsider}
                onSetQty={onSetQty}
                cardDragEnabled={cardDragEnabled}
                moveTargets={cardDragEnabled ? moveTargets : null}
                onCardMove={onCardMove}
                expandedCard={expandedCard}
                setExpandedCard={setExpandedCard}
              />
            ))}
          </div>
        </StackColumn>
      ),
    });
  });

  // Considering — pinned trailing column: never in the maindeck, never regrouped,
  // never draggable. Cards open the detail modal (Add to deck / Remove live there).
  if (consideringColumn && consideringColumn.length > 0) {
    const price = consideringColumn.reduce((sum, c) => sum + (metaMap?.[c.name]?.price_usd || 0) * c.qty, 0);
    items.push({
      key: "__considering__",
      estimatedHeight: estimateColHeight(consideringColumn.length),
      node: (
        <StackColumn
          label="Considering"
          pinned
          icon="☆"
          count={consideringColumn.reduce((s, c) => s + c.qty, 0)}
          price={price}
          className="stack-column-image stack-column-considering"
          menuItems={consideringMenu}
        >
          <div className="stack-cards">
            {consideringColumn.map((c) => (
              <StackCard
                key={c.name}
                name={c.name}
                qty={c.qty}
                columnLabel="Considering"
                onCardClick={onCardClick}
                onRemove={null}
                onConsider={null}
                cardDragEnabled={false}
                moveTargets={null}
                expandedCard={expandedCard}
                setExpandedCard={setExpandedCard}
              />
            ))}
          </div>
        </StackColumn>
      ),
    });
  }

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

// border_crop first: scans vary in baked-in border thickness (IKO-era borders are
// huge), which made equal-size boxes LOOK different sizes. border_crop normalizes
// the card face across printings; onError falls back to the plain scan.
function cardImgSrc(data) {
  return data?.border_crop || data?.image || data?.art_crop || null;
}

function fallbackToNormal(e, data) {
  if (data?.image && e.currentTarget.src !== data.image) e.currentTarget.src = data.image;
}

function GhostCardImg({ name }) {
  const data = useCardImage(name);
  const img = cardImgSrc(data);
  return (
    <div className="stack-card-wrap">
      {img ? <img src={img} alt="" onError={(e) => fallbackToNormal(e, data)} /> : <div className="card-thumb-placeholder">{name}</div>}
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

function StackCard({ name, qty, printing, synergy, columnLabel, onCardClick, onRemove, onConsider, onSetQty, cardDragEnabled, moveTargets, onCardMove, expandedCard, setExpandedCard }) {
  const canHover = useCanHover();
  const data = useCardImage(name, printing);
  const img = cardImgSrc(data);
  const cardId = `${columnLabel}:${name}`;
  const expanded = expandedCard === cardId;

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
    if (expanded) { onCardClick?.(name); setExpandedCard?.(null); }
    else { setExpandedCard?.(cardId); }
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
        <img src={img} alt={`${qty}x ${name}`} loading="lazy" onError={(e) => fallbackToNormal(e, data)} />
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
