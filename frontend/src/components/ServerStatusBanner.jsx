export default function ServerStatusBanner({ status, onRetry }) {
  const offline = status === "offline";
  return (
    <div className={`server-banner${offline ? " offline" : ""}`} role="alert" aria-live="polite">
      {offline ? (
        <>
          <span className="server-banner-dot" />
          <span>Server unreachable — deck tools may not work.</span>
          <button className="server-banner-retry" onClick={onRetry}>Retry</button>
        </>
      ) : (
        <>
          <span className="server-banner-spinner" />
          <span>Connecting to server…</span>
        </>
      )}
    </div>
  );
}
