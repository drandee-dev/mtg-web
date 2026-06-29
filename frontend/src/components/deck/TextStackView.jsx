import { canHover } from "../../lib/hooks";
import ManaCost from "./ManaCost";
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
}) {
  const labels = groups.map(([label]) => label);
  return (
    <div className={`stack-view text-stack-view ${canHover ? "" : "stack-touch"}`}>
      {groups.map(([label, cards], i) => {
        const { qty, price } = columnTotals(cards, metaMap);
        const moveTargets = labels.filter((l) => l !== label);
        return (
          <StackColumn
            key={label}
            label={label}
            count={qty}
            price={price}
            cardDragEnabled={cardDragEnabled}
            onColumnReorder={onColumnReorder}
            onCardMove={onCardMove}
            onColumnNudge={onColumnNudge}
            canMoveLeft={i > 0}
            canMoveRight={i < groups.length - 1}
            className="stack-column-text"
          >
            <div className="ts-rows" role="list">
              {cards.map((c) => (
                <TextRow
                  key={c.name}
                  name={c.name}
                  qty={c.qty}
                  manaCost={metaMap?.[c.name]?.mana_cost || ""}
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
        );
      })}
    </div>
  );
}

function TextRow({ name, qty, manaCost, onCardClick, onRemove, onConsider, cardDragEnabled, moveTargets, onCardMove }) {
  const showMoveMenu = !canHover && moveTargets && moveTargets.length > 0;
  const moveItems = showMoveMenu
    ? moveTargets.map((t) => ({ label: `Move to ${t}`, onClick: () => onCardMove?.(name, t) }))
    : [];

  return (
    <div
      className="ts-row"
      role="listitem"
      tabIndex={0}
      draggable={cardDragEnabled && canHover}
      onDragStart={cardDragEnabled && canHover ? (e) => {
        e.dataTransfer.setData("text/plain", `card:${name}`);
        e.dataTransfer.effectAllowed = "move";
      } : undefined}
      onClick={() => onCardClick?.(name)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCardClick?.(name); } }}
      aria-label={`${qty}x ${name}`}
    >
      <span className="ts-qty">{qty}</span>
      <span className="ts-name">{name}</span>
      <ManaCost cost={manaCost} />
      <span className="ts-row-actions">
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
