// Arrow keys on a role="tablist" (audit job 6.4b). Left and Right move focus
// between its tabs, Home and End go to the ends, and that is all: Enter or
// Space opens the focused tab, which a button does by itself. Opening on arrow
// would run whatever a tab's click runs, and "How to play" can start a paid
// write-up. Give each tab tabIndex={tabStop(selected)} so the strip is one Tab
// stop, on the open tab.

export const tabStop = (selected) => (selected ? 0 : -1);

/** The index to focus next, or -1 when the key is not one of ours. */
export function nextTab(key, at, count) {
  if (count <= 0 || at < 0) return -1;
  if (key === "ArrowRight") return (at + 1) % count;
  if (key === "ArrowLeft") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

export function onTabListKeyDown(e) {
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]:not([disabled])')];
  const next = nextTab(e.key, tabs.indexOf(document.activeElement), tabs.length);
  if (next < 0) return;
  e.preventDefault();
  tabs[next].focus();
}
