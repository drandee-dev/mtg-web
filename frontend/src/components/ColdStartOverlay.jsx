import { useEffect, useState } from "react";

export default function ColdStartOverlay({ status, onRetry }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const offline = status === "offline";
  return (
    <div className={`cold-start-overlay${offline ? " offline" : ""}`} role="alert" aria-live="polite">
      <div className="cold-start-smoke">
        <span /><span /><span /><span />
      </div>
      <div className="cold-start-icon">⚡</div>
      <div className="cold-start-text">
        {offline ? "Server didn't respond" : "Summoning the server…"}
      </div>
      <div className="cold-start-sub">
        {offline
          ? "The server may be down. Tap below to try again."
          : "Free-tier cold start — usually takes ~30 seconds"}
      </div>
      {!offline && (
        <>
          <div className="cold-start-bar"><div className="cold-start-bar-fill" /></div>
          {elapsed >= 10 && (
            <div className="cold-start-elapsed">{elapsed}s elapsed — still working</div>
          )}
        </>
      )}
      {offline && (
        <button className="cold-start-retry" onClick={onRetry}>Retry connection</button>
      )}
    </div>
  );
}
