import { useEffect, useRef, useState } from "react";

// CSS multi-column (`column-width`) looks like masonry but rebalances its whole
// content flow whenever any item's height changes — including a card's hover-reveal
// margin shift. That rebalance relocates unrelated cards into different columns
// mid-interaction (see stack-view hover glitch). This hook instead measures the
// container width to compute how many fixed-width tracks fit, so packing can be
// done once in JS into independent column buckets that never reflow into each other.
export function useColumnCount(trackWidth, gap) {
  const ref = useRef(null);
  const [count, setCount] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const n = Math.max(1, Math.floor((w + gap) / (trackWidth + gap)));
      setCount(n);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [trackWidth, gap]);

  return [ref, count];
}

// Greedy shortest-bucket bin packing — each item goes into whichever column
// currently has the least estimated height. Deterministic from `items` and
// `columnCount` only, so it never recomputes from live DOM measurements and is
// stable across hover/focus state changes.
export function packMasonry(items, columnCount) {
  const heights = new Array(columnCount).fill(0);
  const columns = Array.from({ length: columnCount }, () => []);
  for (const item of items) {
    let target = 0;
    for (let i = 1; i < columnCount; i++) {
      if (heights[i] < heights[target]) target = i;
    }
    columns[target].push(item);
    heights[target] += item.estimatedHeight;
  }
  return columns;
}
