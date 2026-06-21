import { useEffect, useState } from "react";

export default function LoadingIndicator({ label = "Thinking", active = true }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(((Date.now() - start) / 1000).toFixed(0)), 500);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <div className="loading-indicator">
      <span className="loading-dot" />
      <span>{label}… {elapsed > 0 && <span className="muted">{elapsed}s</span>}</span>
    </div>
  );
}
