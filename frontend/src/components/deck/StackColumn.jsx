import { useDraggable, useDroppable } from "@dnd-kit/core";
import { canHover } from "../../lib/hooks";
import MoreMenu from "./MoreMenu";

// Shared column shell for both image and text stacks. Owns the column header
// (drag handle + label + qty + price total). Drag-and-drop is handled by dnd-kit:
// the header is a draggable (data carried via `dragData`), and the whole column is
// a droppable (data { type: "column-dropzone", label }). The parent StackDndContext
// routes drops to onColumnReorder / onCardMove.
//
// Drag is a pointer-only affordance, so on touch (canHover === false) dnd is
// disabled and the header shows a ⋯ menu to nudge the column left/right instead.
export default function StackColumn({
  label,
  count,
  price,
  onColumnNudge,
  canMoveLeft,
  canMoveRight,
  className = "",
  isCommander = false,
  menuItems = null,
  dragData = null,
  children,
}) {
  // Commander column is fixed in place; touch keeps the ⋯ nudge menu instead of drag.
  const dndDisabled = isCommander || !canHover;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${label}`,
    data: { type: "column-dropzone", label },
    disabled: dndDisabled,
  });

  const { setNodeRef: setDragRef, listeners, isDragging } = useDraggable({
    id: `colhdr:${label}`,
    data: dragData || { type: "column", label },
    disabled: dndDisabled,
  });

  const nudgeItems = [];
  if (canMoveLeft) nudgeItems.push({ label: "Move column left", icon: "‹", onClick: () => onColumnNudge?.(label, -1) });
  if (canMoveRight) nudgeItems.push({ label: "Move column right", icon: "›", onClick: () => onColumnNudge?.(label, 1) });

  return (
    <div
      ref={setDropRef}
      className={`stack-column ${className} ${isOver ? "stack-column-droptarget" : ""} ${isDragging ? "stack-column-dragging" : ""}`}
    >
      <div
        ref={setDragRef}
        className="stack-column-header"
        title={!dndDisabled ? "Drag to reorder column" : undefined}
        style={isCommander ? { cursor: "default" } : (canHover ? { cursor: "grab", touchAction: "none" } : undefined)}
        {...(dndDisabled ? {} : listeners)}
      >
        {isCommander
          ? <span className="stack-column-crown" aria-hidden="true">♛</span>
          : canHover && <span className="stack-column-grip" aria-hidden="true">⠿</span>}
        <span className="stack-column-label">{label}</span>
        <span className="stack-column-meta">
          <span className="stack-column-count">{count}</span>
          {price > 0 && <span className="stack-column-price">${price.toFixed(2)}</span>}
          {menuItems && menuItems.length > 0 && (
            <span onPointerDown={(e) => e.stopPropagation()}>
              <MoreMenu items={menuItems} label={`${label} options`} />
            </span>
          )}
          {!isCommander && !canHover && nudgeItems.length > 0 && (
            <MoreMenu items={nudgeItems} label={`Reorder ${label} column`} />
          )}
        </span>
      </div>
      {children}
    </div>
  );
}
