import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getCardImage } from "./api";

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

// Live hover-capability hook — re-evaluates when the primary input changes
// (e.g. iPad trackpad attached/detached), unlike a module-load snapshot.
export function useCanHover() {
  return useMediaQuery(HOVER_QUERY);
}

// Live media-query hook — re-evaluates on viewport/input changes.
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    const mq = window.matchMedia?.(query);
    if (!mq) return () => {};
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false);
}

export function useCardImage(name, printing = null) {
  const [data, setData] = useState(null);
  // Depend on primitives — `printing` is a fresh object every parse.
  const pset = printing?.set || null;
  const pcn = printing?.cn || null;
  useEffect(() => {
    if (!name) { setData(null); return; }
    let cancelled = false;
    getCardImage(name, pset ? { set: pset, cn: pcn } : null)
      .then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [name, pset, pcn]);
  return data;
}

export function useEscapeKey(active, onEscape) {
  useEffect(() => {
    if (!active) return;
    function handler(e) { if (e.key === "Escape") onEscape(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal focus management: when `active`, moves focus into the returned ref's
// element, traps Tab/Shift+Tab within it, and restores focus to the previously
// focused element (the trigger) on close. Attach the ref to the dialog panel
// and give it tabIndex={-1} so it can hold focus when it has no focusable child.
export function useFocusTrap(active) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const prevFocus = document.activeElement;
    (node.querySelector(FOCUSABLE) || node).focus();

    function onKey(e) {
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll(FOCUSABLE));
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || !node.contains(cur))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (cur === last || !node.contains(cur))) {
        e.preventDefault();
        first.focus();
      }
    }

    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
    };
  }, [active]);
  return ref;
}

export function downloadFile(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
