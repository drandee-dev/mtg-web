import { useCallback, useRef, useState } from "react";

/** The one toast. `notify(msg, action)` shows it; an action is
 * `{ label, onClick }` ("Saved. [Share]"). Action toasts stay up longer, and a
 * new toast replaces the pending dismiss timer. `dismiss()` clears it now. */
export function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef(null);
  const life = useRef(3500);
  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), life.current);
  }, []);
  const notify = useCallback((msg, action) => {
    setToast(msg ? { text: msg, action: action || null } : "");
    life.current = action ? 6500 : 3500;
    start();
  }, [start]);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast("");
  }, []);
  // The pointer or keyboard focus on the toast stops its clock (its Undo is in
  // there); leaving starts a full one again (audit job 6.4).
  const hold = useCallback(() => clearTimeout(timer.current), []);
  return { toast, notify, dismiss, hold, release: start };
}
