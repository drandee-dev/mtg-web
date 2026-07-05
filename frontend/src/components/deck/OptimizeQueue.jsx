import { useState } from "react";
import CardPreview from "../CardPreview";
import LoadingIndicator from "../LoadingIndicator";
import { describeEntry } from "../../lib/optimizeLog";

const COLLAPSE_KEY = "mtgweb:optCollapsed";

// Goal-driven Apply/Skip queue. State lives in DeckView (like cuts/upgrades)
// so it survives the mobile hub portal mounting and unmounting this component.
export default function OptimizeQueue({
  optimize, optimizing, onRun,
  decided, onApply, onSkip,
  log, onUndo, onClearLog,
  gapCount = 0,
}) {
  const changes = optimize?.changes || [];
  const pending = changes.filter((c) => !decided[c.id]);
  const appliedCount = changes.filter((c) => decided[c.id] === "applied").length;

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <div className="opt-queue sidebar-section">
      <div className="opt-head">
        <button
          className="opt-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="opt-body"
        >
          <span className="opt-caret" aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
          <span className="opt-title">⚡ Optimize</span>
          {collapsed && pending.length > 0 && (
            <span className="opt-pending-badge">{pending.length}</span>
          )}
        </button>
        <button className="primary small opt-run" onClick={() => onRun()} disabled={optimizing}>
          {optimizing
            ? "Thinking…"
            : optimize
              ? "Re-run"
              : gapCount > 0
                ? `Run · ${gapCount} gap${gapCount === 1 ? "" : "s"}`
                : "Run"}
        </button>
      </div>

      {collapsed ? null : (
      <div id="opt-body">
      {optimizing && <LoadingIndicator label="Building changeset" active />}

      {!optimize && !optimizing && (
        <p className="opt-hint">
          One AI pass proposes swaps toward your deck goals — you approve each one.
        </p>
      )}

      {optimize?.error && !optimizing && (
        <p className="opt-error">{optimize.message || "Optimize failed — try again."}</p>
      )}

      {optimize && !optimize.error && !optimizing && (
        <>
          {optimize.assessment && <p className="opt-assess">{optimize.assessment}</p>}
          {changes.length === 0 && (
            <p className="opt-hint">No changes proposed — the deck already fits your goals.</p>
          )}
          {changes.length > 0 && pending.length === 0 && (
            <p className="opt-hint">
              Queue clear — {appliedCount ? `${appliedCount} applied. ` : ""}Re-run for a fresh pass.
            </p>
          )}
          {pending.map((ch) => (
            <ChangeCard key={ch.id} ch={ch} onApply={onApply} onSkip={onSkip} />
          ))}
        </>
      )}

      {log.length > 0 && (
        <details className="opt-log">
          <summary className="opt-log-summary">Session log ({log.length})</summary>
          <div className="opt-log-body">
            {[...log].reverse().map((e) => (
              <div key={e.id} className="opt-log-row">
                <span className="opt-log-desc">
                  {e.cut && <CardPreview name={e.cut} />}
                  {e.cut && e.add && <span className="opt-arrow"> → </span>}
                  {e.add && <CardPreview name={e.add} />}
                  {!e.cut && !e.add && describeEntry(e)}
                  {e.source === "chat" && <span className="opt-cat" style={{ marginLeft: ".3rem" }}>chat</span>}
                </span>
                <button className="ghost small opt-undo" onClick={() => onUndo(e)}>Undo</button>
              </div>
            ))}
            <button className="ghost small opt-clear" onClick={onClearLog}>Clear log</button>
          </div>
        </details>
      )}
      </div>
      )}
    </div>
  );
}

const ACTION_LABEL = { swap: "Swap", cut: "Cut", add: "Add" };

function ChangeCard({ ch, onApply, onSkip }) {
  const delta = ch.price_delta;
  return (
    <div className="opt-card">
      <div className="opt-card-top">
        <span className={`opt-badge opt-act-${ch.action}`}>{ACTION_LABEL[ch.action] || ch.action}</span>
        <span className={`opt-impact opt-imp-${ch.impact}`}>{ch.impact}</span>
        {ch.category && <span className="opt-cat">{ch.category}</span>}
        {delta != null && delta !== 0 && (
          <span className={`opt-delta ${delta > 0 ? "up" : "down"}`}>
            {delta > 0 ? `+$${delta.toFixed(2)}` : `−$${Math.abs(delta).toFixed(2)}`}
          </span>
        )}
      </div>
      <div className="opt-names">
        {ch.cut && <CardPreview name={ch.cut} />}
        {ch.cut && ch.add && <span className="opt-arrow"> → </span>}
        {ch.add && <CardPreview name={ch.add} />}
      </div>
      {ch.reason && <p className="opt-reason">{ch.reason}</p>}
      <div className="opt-actions">
        <button className="ghost small" onClick={() => onSkip(ch)}>Skip</button>
        <button className="primary small" onClick={() => onApply(ch)}>Apply</button>
      </div>
    </div>
  );
}
