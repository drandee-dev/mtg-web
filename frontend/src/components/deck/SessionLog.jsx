import CardPreview from "../CardPreview";
import { describeEntry } from "../../lib/optimizeLog";

// The deck's applied and skipped changes, newest first, each with Undo. It
// lived at the foot of the Optimize queue; the queue's cards are now the
// Suggested changes list, and the log stays under it.
export default function SessionLog({ log, onUndo, onClearLog }) {
  if (!log.length) return null;
  return (
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
  );
}
