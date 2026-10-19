import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";

// Shared drag-and-drop shell for both stack views (image + text). Replaces the old
// native HTML5 DnD, which couldn't render a custom multi-card "picked up" ghost.
//
// Two drag operations, distinguished by `active.data.current.type`:
//   "column" — a category column header dragged onto another column → onColumnReorder
//   "card"   — a single card dragged onto another column (role mode) → onCardMove
// Drop targets are the columns themselves, registered as droppables with
// data { type: "column-dropzone", label }.
//
// `renderGhost(activeData)` is view-specific: the image view renders an opaque
// lifted stack of card art; the text view renders the dragged rows. The floating
// copy lives in DragOverlay so it can escape the masonry column's overflow.
// The picked-up copy fades out where it was dropped while the real column slides into its
// new place (FlipColumns), instead of vanishing. It does not fly to the old spot: that is
// where the dimmed original was, and the column is already leaving it. Reduced motion: it just goes.
const at = ({ x, y, scaleX, scaleY }) => `translate3d(${x}px, ${y}px, 0) scaleX(${scaleX}) scaleY(${scaleY})`;
const DROP_FADE = {
  duration: 160,
  easing: "ease-out",
  keyframes: ({ transform }) => [
    { opacity: 1, transform: at(transform.initial) },
    { opacity: 0, transform: at(transform.initial) },
  ],
};

export default function StackDndContext({ onColumnReorder, onCardMove, renderGhost, children }) {
  const [active, setActive] = useState(null);

  // A small activation distance means a plain click still fires (card preview,
  // ⋯ menus, corner ✕) — a drag only begins once the pointer travels 6px.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(e) {
    setActive(e.active?.data?.current || null);
  }

  function handleDragEnd(e) {
    setActive(null);
    const a = e.active?.data?.current;
    const o = e.over?.data?.current;
    if (!a || !o || o.type !== "column-dropzone") return;
    if (a.type === "column" && a.label !== o.label) {
      onColumnReorder?.(a.label, o.label);
    } else if (a.type === "card" && a.columnLabel !== o.label) {
      onCardMove?.(a.name, o.label);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActive(null)}
    >
      {children}
      <DragOverlay dropAnimation={window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? null : DROP_FADE} className="stack-drag-overlay">
        {active ? renderGhost(active) : null}
      </DragOverlay>
    </DndContext>
  );
}
