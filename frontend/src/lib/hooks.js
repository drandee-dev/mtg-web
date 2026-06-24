import { useEffect, useState } from "react";
import { getCardImage } from "./api";

export const canHover =
  typeof window !== "undefined" &&
  window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

export function useCardImage(name) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!name) { setData(null); return; }
    let cancelled = false;
    getCardImage(name).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [name]);
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

export function downloadFile(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
