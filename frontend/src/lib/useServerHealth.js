import { useEffect, useState } from "react";
import { api } from "./api";

/** The backend's health, checked on mount and again on `retry()`: `status` is
 * "checking", "waking" (the first check failed), "ready" or "offline" (three
 * failed checks, about 10 seconds). `ai` is whether the server has AI set up
 * and `warmed` whether its caches are warm; both come from the health reply. */
export function useServerHealth() {
  const [status, setStatus] = useState("checking");
  const [attempt, setAttempt] = useState(0);
  const [ai, setAi] = useState(true);
  const [warmed, setWarmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A re-check (Retry) puts the banner back to "Connecting" before the request.
    setStatus("checking"); // eslint-disable-line react-hooks/set-state-in-effect
    async function check(n) {
      try {
        const h = await api.health();
        if (!cancelled) { setStatus("ready"); setAi(Boolean(h?.ai_available)); setWarmed(Boolean(h?.warmed)); }
      } catch {
        if (cancelled) return;
        if (n === 0) setStatus("waking");
        // Serverless backend: no cold-start wake to wait out — a failing health
        // check means a real outage, so give up after three tries (~10s).
        if (n < 2) {
          setTimeout(() => check(n + 1), 5000);
        } else {
          setStatus("offline");
        }
      }
    }
    check(0);
    return () => { cancelled = true; };
  }, [attempt]);

  return { status, ai, warmed, retry: () => setAttempt((n) => n + 1) };
}
