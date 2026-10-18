import { useEffect, useState } from "react";
import CardPreview from "../CardPreview";
import { getCardImage } from "../../lib/api";
import { fmtUsd } from "../../lib/format";

// One small card picture. getCardImage caches per name for the session, so a
// card that shows up in two rows, or again after "Look again", costs one lookup.
function Thumb({ name }) {
  const [got, setGot] = useState(null);
  useEffect(() => {
    let live = true;
    getCardImage(name).then((d) => { if (live) setGot({ name, url: d?.thumb || d?.image || null }); });
    return () => { live = false; };
  }, [name]);
  const url = got?.name === name ? got.url : null;
  return url
    ? <img className="chg-thumb" src={url} alt="" loading="lazy" />
    : <span className="chg-thumb chg-thumb-empty" />;
}

// A change row's shape while the list loads: same classes, so the same height.
export function ChangeCardPlaceholder() {
  return (
    <div className="opt-card" aria-hidden="true">
      <div className="chg-swap"><span className="chg-thumb ph" /><span className="chg-thumb ph" /></div>
      <div className="chg-why"><span className="ph ph-line ph-w-60" /><span className="ph ph-line ph-w-90" /></div>
      <div className="opt-actions"><span className="ph ph-btn" /><span className="ph ph-btn" /></div>
    </div>
  );
}

// One proposal as drawn on `Improve`: the cards, what to do with them, why,
// and Apply / Skip. Every source in the Suggested changes list renders through
// this (EDHREC suggestions, the AI pass, budget swaps), so there is one
// apply/skip interaction. `extra` is an optional control (the suggestion pin)
// beside Skip and Apply. `data-source` lets a test tell the sources apart.
export default function ChangeCard({ ch, onApply, onSkip, extra = null }) {
  const delta = ch.price_delta;
  return (
    <div className="opt-card" data-source={ch.source} data-action={ch.action}>
      <div className="chg-swap" aria-hidden="true">
        {ch.cut && <Thumb name={ch.cut} />}
        {ch.cut && ch.add && (
          <svg className="chg-arrow" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        )}
        {ch.add && <Thumb name={ch.add} />}
      </div>
      <div className="chg-why">
        <b className="opt-names">
          {ch.cut && <>Cut <CardPreview name={ch.cut} /></>}
          {ch.cut && ch.add && ", "}
          {ch.add && <>{ch.cut ? "add" : "Add"} <CardPreview name={ch.add} /></>}
        </b>
        {ch.reason && <span className="opt-reason">{ch.reason}</span>}
        {(ch.category || (delta != null && delta !== 0)) && (
          <span className="chg-meta">
            {ch.category && <span className="opt-cat">{ch.category}</span>}
            {delta != null && delta !== 0 && (
              <span className={`opt-delta ${delta > 0 ? "up" : "down"}`}>
                {delta > 0 ? `+${fmtUsd(delta)}` : `−${fmtUsd(Math.abs(delta))}`}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="opt-actions">
        {extra}
        <button type="button" className="ghost" onClick={() => onSkip(ch)}>Skip</button>
        <button type="button" className="ghost chg-apply" onClick={() => onApply(ch)}>Apply</button>
      </div>
    </div>
  );
}
