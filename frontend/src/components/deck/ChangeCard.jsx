import { useEffect, useState } from "react";
import CardPreview from "../CardPreview";
import { useInfoTip } from "../InfoTip";
import { getCardImage } from "../../lib/api";
import { fmtUsd } from "../../lib/format";

const CHEAPER_TIP =
  "The AI names the strongest card for this slot, whatever it costs, and a cheaper card "
  + "that does the same job. With a budget in Goals, the cheaper card is the one asked to "
  + "keep the deck under it. \"Over your budget\": this card adds cost and the deck would "
  + "end up above your budget. \"Still over budget\": the deck is already above it and stays "
  + "there, even though this card saves money. Both use the deck's price when the AI made "
  + "its suggestions.";

function Delta({ value }) {
  if (value == null || value === 0) return null;
  return (
    <span className={`opt-delta ${value > 0 ? "up" : "down"}`}>
      {value > 0 ? `+${fmtUsd(value)}` : `−${fmtUsd(Math.abs(value))}`}
    </span>
  );
}

// Over the Goals budget after this card. A pick that saves money can still be
// "over" when the deck started above the cap; saying "Over your budget" there read
// as if the card broke it (the La Dispute run, 2026-11-06).
const Over = ({ on, delta }) => (on
  ? <span className="opt-over">{delta > 0 ? "Over your budget" : "Still over budget"}</span>
  : null);

// One small card picture. getCardImage caches per name for the session, so a
// card that shows up in two rows, or again after "Look again", costs one lookup.
function Thumb({ name, className = "chg-thumb" }) {
  const [got, setGot] = useState(null);
  useEffect(() => {
    let live = true;
    getCardImage(name).then((d) => { if (live) setGot({ name, url: d?.thumb || d?.image || null }); });
    return () => { live = false; };
  }, [name]);
  const url = got?.name === name ? got.url : null;
  return url
    ? <img className={className} src={url} alt="" loading="lazy" />
    : <span className={`${className} chg-thumb-empty`} />;
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
//
// An AI change can carry a `cheaper` card for the same slot (suggestions job 4,
// Andres's layout C): the card stays as it was with the strongest pick, and a
// line under the reason offers the cheaper one. Applying it is the same change
// with that card as the add, so it shares the change's id and its log entry.
export default function ChangeCard({ ch, onApply, onSkip, extra = null }) {
  const delta = ch.price_delta;
  const alt = ch.cheaper;
  const tip = useInfoTip(alt ? `the cheaper ${alt.name}` : "the cheaper option", CHEAPER_TIP);
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
        {(ch.category || (delta != null && delta !== 0) || ch.over_budget) && (
          <span className="chg-meta">
            {ch.category && <span className="opt-cat">{ch.category}</span>}
            <Delta value={delta} />
            <Over on={ch.over_budget} delta={delta} />
          </span>
        )}
        {alt && (
          <div className="chg-alt info-tip-host">
            {/* Picture and name wrap as one piece, so a phone keeps them together. */}
            <span className="chg-alt-card">
              <Thumb name={alt.name} className="chg-thumb chg-alt-thumb" />
              <span className="chg-alt-text">
                Cheaper: <b><CardPreview name={alt.name} /></b> <Delta value={alt.price_delta} />{" "}
                <Over on={alt.over_budget} delta={alt.price_delta} />
              </span>
            </span>
            {tip.button}
            <button
              type="button"
              className="ghost chg-alt-apply"
              aria-label={`Apply cheaper: ${alt.name}`}
              onClick={() => onApply({
                ...ch, add: alt.name, price_usd: alt.price_usd, price_delta: alt.price_delta,
                over_budget: alt.over_budget, reason: alt.reason || ch.reason, cheaper: null,
                strongest: ch.add,
              })}
            >Apply cheaper</button>
            {alt.reason && <span className="chg-alt-why">{alt.reason}</span>}
            {tip.panel}
          </div>
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
