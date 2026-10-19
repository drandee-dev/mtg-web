import { Component, createRef } from "react";

// Slides the stack's columns to their new places when their order changes (FLIP: First,
// Last, Invert, Play). The masonry puts a column in whichever track is shortest, so a
// reorder can move a column to a different container and React mounts it fresh; without
// this it is gone from one spot and there in another, with nothing between.
//
// The old positions have to be read just before React changes the DOM, and only a class
// component's getSnapshotBeforeUpdate runs at that moment. The slide is a transform only,
// so it costs no layout per frame. Reduced motion skips it: the column jumps.
//
// Only a change of `orderKey` slides. A resize, a filter or a new card moves columns too,
// and a slide on every keystroke would be noise.
const REDUCED = "(prefers-reduced-motion: reduce)";

function positions(root) {
  const at = new Map();
  root.querySelectorAll("[data-column]").forEach((n) => {
    const r = n.getBoundingClientRect();
    at.set(n.dataset.column, { x: r.left, y: r.top });
  });
  return at;
}

export default class FlipColumns extends Component {
  root = createRef();

  getSnapshotBeforeUpdate(prev) {
    if (prev.orderKey === this.props.orderKey || !this.root.current) return null;
    return positions(this.root.current);
  }

  componentDidUpdate(_prev, _state, was) {
    if (!was || !this.root.current || window.matchMedia?.(REDUCED).matches) return;
    const now = positions(this.root.current);
    this.root.current.querySelectorAll("[data-column]").forEach((n) => {
      const from = was.get(n.dataset.column);
      const to = now.get(n.dataset.column);
      if (!from || !to) return;
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) return;
      // A longer trip takes longer, so no frame jumps far (the curve's top speed is about twice
      // the average, so a 1ms-per-px trip stays near 40px a frame); a short one stays snappy.
      n.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: Math.min(900, Math.max(200, dist * 1.0)), easing: "cubic-bezier(.4, 0, .2, 1)" },
      );
    });
  }

  // display: contents, so the wrapper adds no box and the flex layout inside is untouched.
  render() {
    return <div ref={this.root} style={{ display: "contents" }}>{this.props.children}</div>;
  }
}
