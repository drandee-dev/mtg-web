import { useCallback, useRef, useState } from "react";

/** The one toast. `notify(msg, action)` shows it; an action is
 * `{ label, onClick }` ("Saved. [Share]"). Action toasts stay up longer, and a
 * new toast replaces the pending dismiss timer. `dismiss()` clears it now. */
export function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef(null);
  const notify = useCallback((msg, action) => {
    setToast(msg ? { text: msg, action: action || null } : "");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), action ? 6500 : 3500);
  }, []);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast("");
  }, []);
  return { toast, notify, dismiss };
}
