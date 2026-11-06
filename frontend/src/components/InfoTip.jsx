import { useEffect, useId, useRef, useState } from "react";

// Help that opens on tap, click or keyboard, not only on hover: the title= texts
// it replaces never showed on a phone or to the keyboard. Andres, 2026-10-25: a
// bubble on desktop, the same text in place under the row on a phone, so it never
// covers a control there. Hence two parts: the caller puts `button` beside its
// label (not inside a heading, which would rename it) and `panel` as the last child
// of the row (an `.info-tip-host`); CSS floats the panel as a bubble on wide screens
// or lets it flow on narrow ones.
//
// The panel is always in the page as a polite status region and gets its text only
// while open, so a screen reader announces the text when it appears. One tip is open
// at a time. Escape and a tap outside close it. Escape moves no focus: the panel holds
// nothing focusable, and a modal opened meanwhile owns focus (Holiday, 2026-10-25).
let closeOpenTip = null;

export function useInfoTip(label, text) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    closeOpenTip = close;
    const outside = (e) => {
      if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      if (closeOpenTip === close) closeOpenTip = null;
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = () => {
    if (!open && closeOpenTip) closeOpenTip(); // another tip, opened by keyboard
    setOpen((o) => !o);
  };

  const button = (
    <button
      type="button"
      ref={btnRef}
      className={`info-tip-btn${open ? " on" : ""}`}
      aria-label={`About ${label}`}
      aria-expanded={open}
      aria-controls={id}
      onClick={toggle}
    >i</button>
  );
  const panel = (
    <div id={id} ref={panelRef} className="info-tip" role="status">{open ? text : null}</div>
  );
  return { button, panel };
}
