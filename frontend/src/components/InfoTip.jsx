import { useEffect, useId, useRef, useState } from "react";

// Help that opens on tap, click or keyboard, not only on hover: the title= texts
// it replaces never showed on a phone or to the keyboard. Andres, 2026-10-25: a
// bubble on desktop, the same text in place under the row on a phone, so it never
// covers a control there. Hence two parts: the caller puts `button` beside its
// label and `panel` as the last child of the row (an `.info-tip-host`), and CSS
// floats the panel as a bubble on wide screens or lets it flow on narrow ones.
// Escape and a tap outside close it; Escape returns focus to the button.
export function useInfoTip(label, text) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const button = (
    <button
      type="button"
      ref={btnRef}
      className={`info-tip-btn${open ? " on" : ""}`}
      aria-label={`About ${label}`}
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen((o) => !o)}
    >i</button>
  );
  const panel = (
    <div id={id} ref={panelRef} className="info-tip" role="note" hidden={!open}>{text}</div>
  );
  return { button, panel };
}
