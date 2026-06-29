import { useRef, useState } from "react";
import { canHover } from "../../lib/hooks";
import MoreMenu from "./MoreMenu";

// Shared column shell for both image and text stacks. Owns the column header
// (drag handle + label + qty + price total) and all drag-and-drop wiring, so the
// two stack views only render their card bodies.
//
// Drag payloads are namespaced strings:
//   "col:<label>"   — a whole category column being reordered
//   "card:<name>"   — a single card being moved to another category (role mode only)
//
// Drag is a pointer-only affordance (HTML5 DnD doesn't fire on touch), so on touch
// devices the header shows a ⋯ menu to nudge the column left/right instead.
export default function StackColumn({
  label,
  count,
  price,
  cardDragEnabled,
  onColumnReorder,
  onCardMove,
  onColumnNudge,
  canMoveLeft,
  canMoveRight,
  className = "",
  children,
}) {
  const [dropHint, setDropHint] = useState(false);
  // Enter/leave can fire for nested children; count depth so the highlight only
  // clears when the drag truly leaves the column (not when crossing a child border).
  const dragDepth = useRef(0);

  function hasPayload(e) {
    return (e.dataTransfer?.types || []).includes("text/plain");
  }

  function handleDragStartColumn(e) {
    e.dataTransfer.setData("text/plain", `col:${label}`);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e) {
    if (!hasPayload(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDragEnter(e) {
    if (!hasPayload(e)) return;
    dragDepth.current += 1;
    setDropHint(true);
  }

  function handleDragLeave(e) {
    if (!hasPayload(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) { dragDepth.current = 0; setDropHint(false); }
  }

  function handleDrop(e) {
    const raw = e.dataTransfer.getData("text/plain");
    dragDepth.current = 0;
    setDropHint(false);
    if (!raw) return;
    e.preventDefault();
    if (raw.startsWith("col:")) {
      const from = raw.slice(4);
      if (from !== label) onColumnReorder?.(from, label);
    } else if (raw.startsWith("card:") && cardDragEnabled) {
      onCardMove?.(raw.slice(5), label);
    }
  }

  const nudgeItems = [];
  if (canMoveLeft) nudgeItems.push({ label: "Move column left", icon: "‹", onClick: () => onColumnNudge?.(label, -1) });
  if (canMoveRight) nudgeItems.push({ label: "Move column right", icon: "›", onClick: () => onColumnNudge?.(label, 1) });

  return (
    <div
      className={`stack-column ${className} ${dropHint ? "stack-column-droptarget" : ""}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <div
        className="stack-column-header"
        draggable={canHover}
        onDragStart={canHover ? handleDragStartColumn : undefined}
        title={canHover ? "Drag to reorder column" : undefined}
      >
        {canHover && <span className="stack-column-grip" aria-hidden="true">⠿</span>}
        <span className="stack-column-label">{label}</span>
        <span className="stack-column-meta">
          <span className="stack-column-count">{count}</span>
          {price > 0 && <span className="stack-column-price">${price.toFixed(2)}</span>}
          {!canHover && nudgeItems.length > 0 && (
            <MoreMenu items={nudgeItems} label={`Reorder ${label} column`} />
          )}
        </span>
      </div>
      {children}
    </div>
  );
}
