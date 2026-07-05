import { useDraggable } from "@dnd-kit/core";
import { useCanHover } from "../../lib/hooks";
import { useColumnCount, packMasonry } from "../../lib/masonry";
import ManaCost from "./ManaCost";
import StackColumn from "./StackColumn";
import StackDndContext from "./StackDndContext";
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

// Header + row height (26px + 1px gap) per card, plus container padding.
const HEADER_H = 34;
const ROW_H = 27;
function estimateColHeight(cardCount) {
  return HEADER_H + cardCount * ROW_H + 10;
}

const GHOST_MAX_ROWS = 8;

// Archidekt-style text columns: compact rows of qty · name · mana pips. Cards are
// listed (not overlapped), so a whole category reads as a scannable list.
export default function TextStackView({
  groups,
  metaMap = {},
  onCardClick,
  onRemove,
  onConsider,
  cardDragEnabled = false,
  onColumnReorder,
  onColumnNudge,
  onCardMove,
  commanderColumn = null,
  onChangeCommander,
  consideringColumn = null,
  consideringMenu = null,
  landSuffix = null,
}) {
  const canHover = useCanHover();
  const [containerRef, columnCount] = useColumnCount(216, 11.2);
  const labels = groups.map(([label]) => label);

  // Card descriptors carried in drag data so the ghost can render mana pips.
  const withMana = (cards) => cards.map((c) => ({ ...c, manaCost: metaMap?.[c.name]?.mana_cost || "" }));

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
          className="stack-column-text"
          menuItems={onChangeCommander ? [{ label: "Change commander", onClick: onChangeCommander }] : null}
        >
          <div className="ts-rows" role="list">
            {commanderColumn.map((c) => (
              <TextRow
                key={c.name}
                name={c.name}
                qty={c.qty}
                manaCost={metaMap?.[c.name]?.mana_cost || ""}
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
          countSuffix={landSuffix?.(label) || null}
          onColumnNudge={onColumnNudge}
          canMoveLeft={i > 0}
          canMoveRight={i < groups.length - 1}
          className="stack-column-text"
          dragData={{ type: "column", label, cards: withMana(cards) }}
        >
          <div className="ts-rows" role="list">
            {cards.map((c) => (
              <TextRow
                key={c.name}
                name={c.name}
                qty={c.qty}
                manaCost={metaMap?.[c.name]?.mana_cost || ""}
                columnLabel={label}
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

  // Considering — pinned trailing column; see StackView for the contract.
  if (consideringColumn && consideringColumn.length > 0) {
    const { qty, price } = columnTotals(consideringColumn, metaMap);
    items.push({
      key: "__considering__",
      estimatedHeight: estimateColHeight(consideringColumn.length),
      node: (
        <StackColumn
          label="Considering"
          pinned
          icon="☆"
          count={qty}
          price={price}
          className="stack-column-text stack-column-considering"
          menuItems={consideringMenu}
        >
          <div className="ts-rows" role="list">
            {consideringColumn.map((c) => (
              <TextRow
                key={c.name}
                name={c.name}
                qty={c.qty}
                manaCost={metaMap?.[c.name]?.mana_cost || ""}
                columnLabel="Considering"
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

  const cols = Math.max(1, Math.min(columnCount, items.length));
  const buckets = packMasonry(items, cols);

  return (
    <StackDndContext onColumnReorder={onColumnReorder} onCardMove={onCardMove} renderGhost={renderTextGhost}>
      <div ref={containerRef} className={`stack-view text-stack-view ${canHover ? "" : "stack-touch"}`}>
        {buckets.map((bucket, i) => (
          <div className="stack-masonry-col" key={i}>
            {bucket.map((item) => <div key={item.key}>{item.node}</div>)}
          </div>
        ))}
      </div>
    </StackDndContext>
  );
}

// ── Drag ghosts (text view) ────────────────────────────────────────────────────
function renderTextGhost(active) {
  if (active.type === "column") return <ColumnTextGhost label={active.label} cards={active.cards} />;
  if (active.type === "card") return <ColumnTextGhost cards={[{ name: active.name, qty: active.qty, manaCost: active.manaCost }]} />;
  return null;
}

function GhostRow({ name, qty, manaCost }) {
  return (
    <div className="ts-row">
      <span className="ts-qty">{qty}</span>
      <span className="ts-name">{name}</span>
      <ManaCost cost={manaCost} />
    </div>
  );
}

function ColumnTextGhost({ cards }) {
  const shown = cards.slice(0, GHOST_MAX_ROWS);
  return (
    <div className="stack-drag-ghost stack-column stack-column-text">
      <div className="ts-rows">
        {shown.map((c) => <GhostRow key={c.name} name={c.name} qty={c.qty} manaCost={c.manaCost} />)}
      </div>
    </div>
  );
}

function TextRow({ name, qty, manaCost, columnLabel, onCardClick, onRemove, onConsider, cardDragEnabled, moveTargets, onCardMove }) {
  const canHover = useCanHover();
  const dragDisabled = !cardDragEnabled || !canHover;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `card:${columnLabel}:${name}`,
    data: { type: "card", name, columnLabel, qty, manaCost },
    disabled: dragDisabled,
  });

  const showMoveMenu = !canHover && moveTargets && moveTargets.length > 0;
  const moveItems = showMoveMenu
    ? moveTargets.map((t) => ({ label: `Move to ${t}`, onClick: () => onCardMove?.(name, t) }))
    : [];

  return (
    <div
      ref={setNodeRef}
      className={`ts-row ${isDragging ? "stack-card-dragging" : ""}`}
      role="listitem"
      tabIndex={0}
      style={dragDisabled ? undefined : { touchAction: "none" }}
      {...(dragDisabled ? {} : listeners)}
      onClick={() => onCardClick?.(name)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCardClick?.(name); } }}
      aria-label={`${qty}x ${name}`}
    >
      <span className="ts-qty">{qty}</span>
      <span className="ts-name">{name}</span>
      <ManaCost cost={manaCost} />
      <span className="ts-row-actions" onPointerDown={(e) => e.stopPropagation()}>
        {showMoveMenu && (
          <span onClick={(e) => e.stopPropagation()}>
            <MoreMenu items={moveItems} label={`Move ${name} to another category`} />
          </span>
        )}
        {onConsider && (
          <button className="ts-row-btn" title="Add to considering"
            onClick={(e) => { e.stopPropagation(); onConsider(name); }} aria-label={`Consider ${name}`}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
          </button>
        )}
        {onRemove && (
          <button className="ts-row-btn ts-row-remove" title="Remove from deck"
            onClick={(e) => { e.stopPropagation(); onRemove(name); }} aria-label={`Remove ${name}`}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4l8 8M12 4L4 12"/></svg>
          </button>
        )}
      </span>
    </div>
  );
}
