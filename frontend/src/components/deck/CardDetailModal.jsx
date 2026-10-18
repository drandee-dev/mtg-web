import { useEffect, useRef, useState } from "react";
import { api, assembleDecklist, EMPTY_REPLY } from "../../lib/api";
import { commanderDisplay } from "../../lib/deckParser";
import { BotText } from "../BotText";
import { fmtUsd } from "../../lib/format";
import { useCardImage, useEscapeKey, useFocusTrap } from "../../lib/hooks";
import { useBackClose } from "../../lib/backstack";
import { getBuildNote } from "../../lib/buildNotes";
import ManaCost from "./ManaCost";
import CardPlaceholder from "../CardPlaceholder";

// Scryfall exact-name search redirects to the card's page (which has a Rulings tab).
const scryfallUrl = (name) => `https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`;

// Archidekt-style card detail modal — centered panel on desktop, bottom sheet on
// mobile (responsive via CSS). This is the "modal shell" pass: everything that needs
// no backend/data-model change. The printing/art switcher comes in a later pass.
export default function CardDetailModal({
  name,
  qty = 1,
  printing = null,
  onSetPrinting = null,
  isCommander = false,
  isConsidering = false,
  onAddToDeck,
  onClose,
  onRemove,
  onConsider,
  onSetQty,
  categories = null,
  currentCategory = null,
  onMove,
  onChangeCommander,
  onMakeCommander,
  commander = "",
  decklist = "",
  format = "commander",
}) {
  const data = useCardImage(name, printing);
  const buildNote = getBuildNote(name);
  const [showBack, setShowBack] = useState(false);
  const [prints, setPrints] = useState(null); // null=closed, "loading", or array
  useEscapeKey(Boolean(name), onClose);
  useBackClose(Boolean(name), onClose);
  const panelRef = useFocusTrap(Boolean(name));

  // Mobile bottom-sheet swipe-to-dismiss — drag handle only (CSS hides it on
  // desktop, so these touches simply never fire there). dragY drives a live
  // transform; releasing past the threshold closes, otherwise it snaps back.
  const [dragY, setDragY] = useState(0);
  const drag = useRef({ active: false, startY: 0 });
  const DISMISS_THRESHOLD = 90;

  function onHandleTouchStart(e) {
    drag.current = { active: true, startY: e.touches[0].clientY };
  }
  function onHandleTouchMove(e) {
    if (!drag.current.active) return;
    const delta = e.touches[0].clientY - drag.current.startY;
    if (delta > 0) setDragY(delta);
  }
  function onHandleTouchEnd() {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (dragY > DISMISS_THRESHOLD) onClose();
    else setDragY(0);
  }

  // The two questions the modal can answer in place (job 4.2). Each answer is
  // for the card that was open when it was asked: `askId` moves on with the
  // card, so a late reply for the previous card is dropped.
  const [why, setWhy] = useState(null); // { status: "loading" | "done" | "error", text }
  const [rules, setRules] = useState(null); // { status, text, citations }
  const askId = useRef(0);
  const answersRef = useRef(null);
  // On a phone the buttons sit below the fold and the answer above them, so
  // bring a new answer into view when it appears.
  useEffect(() => {
    if (why || rules) answersRef.current?.scrollIntoView({ block: "nearest" });
  }, [why?.status, rules?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Why is this here?" for a card with no build note: the explain endpoint,
  // for this one card, against the deck as it is now.
  async function askWhy() {
    const id = askId.current;
    setWhy({ status: "loading", text: "" });
    try {
      const r = await api.aiExplain(assembleDecklist(decklist, commander), format, [name], null, null);
      const hit = (r.explanations || []).find((e) => e.name === name) || r.explanations?.[0];
      if (askId.current !== id) return;
      if (r.error || !hit?.explanation || hit.name === "Parse error") {
        setWhy({ status: "error", text: "Couldn't get an answer. Try again." });
      } else {
        setWhy({ status: "done", text: hit.explanation });
      }
    } catch {
      if (askId.current === id) setWhy({ status: "error", text: "Couldn't get an answer. Try again." });
    }
  }

  // "Rules with my commander": the rules answer streams in under the buttons.
  // The question names both cards, which is how the rules route finds them.
  async function askRules() {
    const id = askId.current;
    const cmdr = isCommander ? "" : commanderDisplay(commander);
    const question = cmdr
      ? `How does ${name} work with my commander, ${cmdr}? Cite the rules.`
      : `How does ${name} work? Cite the rules.`;
    setRules({ status: "loading", text: "", citations: [] });
    let text = "";
    let citations = [];
    let failed = "";
    try {
      await api.rulesAskStream(question, (chunk) => {
        if (askId.current !== id) return;
        if (chunk.status === "streaming") {
          text += chunk.text;
          setRules({ status: "loading", text, citations: [] });
        } else if (chunk.status === "done") {
          text = chunk.text;
        } else if (chunk.status === "citations") {
          citations = chunk.citations || [];
        } else if (chunk.status === "error") {
          failed = chunk.message || "Couldn't get an answer. Try again.";
        }
      });
    } catch {
      failed = "Couldn't get an answer. Try again.";
    }
    if (askId.current !== id) return;
    if (failed) setRules({ status: "error", text: failed, citations: [] });
    else if (!text.trim()) setRules({ status: "error", text: EMPTY_REPLY, citations: [] });
    else setRules({ status: "done", text, citations });
  }

  async function togglePrints() {
    if (prints) { setPrints(null); return; }
    setPrints("loading");
    try {
      const r = await api.cardPrints(name);
      setPrints(r.prints || []);
    } catch {
      setPrints([]);
    }
  }

  useEffect(() => {
    if (!name) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [name]);

  // New card → always open on the front face, printings list closed.
  useEffect(() => {
    setShowBack(false); // eslint-disable-line react-hooks/set-state-in-effect
    setPrints(null);
    setDragY(0);
    askId.current += 1;
    setWhy(null);
    setRules(null);
  }, [name]);

  if (!name) return null;

  // Printing/art switcher — shared by the commander and regular-card branches.
  // Pins "Name (SET) 123" (in the decklist for cards, in the commander string
  // for commanders); click the active printing again to reset to default.
  function renderPrintingSwitcher() {
    if (!onSetPrinting) return null;
    return (
      <>
        <div className="cdm-row">
          <span className="cdm-row-label">Printing</span>
          <button className="cdm-print-toggle" onClick={togglePrints} aria-expanded={Boolean(prints)}>
            {printing ? `${printing.set} #${printing.cn}` : "Default"}
            <span aria-hidden="true"> {Array.isArray(prints) ? "▴" : "▾"}</span>
          </button>
        </div>
        {prints === "loading" && (
          <div className="cdm-prints" aria-busy="true">
            <span className="visually-hidden" role="status">Loading printings…</span>
            {[0, 1, 2, 3].map((i) => <CardPlaceholder key={i} />)}
          </div>
        )}
        {Array.isArray(prints) && (
          <div className="cdm-prints" role="listbox" aria-label="Choose a printing">
            {prints.length === 0 && <p className="muted small">No printings found.</p>}
            {prints.map((p) => {
              const active = printing && printing.set === p.set && printing.cn === p.cn;
              return (
                <button
                  key={`${p.set}-${p.cn}`}
                  role="option"
                  aria-selected={Boolean(active)}
                  className={`cdm-print${active ? " on" : ""}`}
                  onClick={() => { onSetPrinting(name, active ? null : { set: p.set, cn: p.cn }); setPrints(null); }}
                  title={`${p.set_name} #${p.cn}${p.price_usd != null ? ` · $${p.price_usd}` : ""}${active ? " — click to reset to default" : ""}`}
                >
                  {p.thumb
                    ? <img src={p.thumb} alt={`${p.set_name} printing`} loading="lazy" />
                    : <span className="cdm-print-noimg">{p.set}</span>}
                  <span className="cdm-print-set">{p.set} #{p.cn}{active ? " ✓" : ""}</span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  const price = data?.price_usd;
  // The two questions. "Why" only when the generator left no note: the note is
  // the answer when there is one. Rules says which commander it is asked with.
  const cmdrName = isCommander ? "" : commanderDisplay(commander);
  const rulesButton = (
    <button className="ghost small" onClick={askRules} disabled={rules?.status === "loading"}>
      {cmdrName ? `Rules with ${cmdrName}` : "Rules"}
    </button>
  );
  const whyButton = !isCommander && !buildNote && decklist.trim() && (
    <button className="ghost small" onClick={askWhy} disabled={why?.status === "loading"}
      title="Asks the AI about this card in this deck">
      Why is this here?
    </button>
  );
  // A card in the 99 can be promoted to the command zone if it's a legendary
  // creature (or explicitly "can be your commander"). type_line loads async, so
  // the action simply appears once the record arrives.
  const canBeCommander = Boolean(onMakeCommander) && (
    /legendary creature/i.test(data?.type_line || "")
    || /can be your commander/i.test(data?.oracle_text || "")
  );
  const hasBack = Boolean(data?.back_image);
  const artSrc = showBack && hasBack ? data.back_image : data?.image;
  const typeLine = showBack && hasBack ? (data?.back_type_line || data?.type_line) : data?.type_line;

  return (
    <div className="cdm-overlay" onClick={onClose}>
      <div
        className="cdm-panel"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        <div
          className="cdm-handle"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onTouchCancel={onHandleTouchEnd}
        />
        <button className="cdm-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="cdm-art">
          {artSrc
            ? <img src={artSrc} alt={showBack ? `${name} (back face)` : name} />
            : <CardPlaceholder name={name} loading className="cdm-art-placeholder" />}
          {hasBack && (
            <button
              className="cdm-flip"
              onClick={() => setShowBack((b) => !b)}
              aria-label={showBack ? "Show front face" : "Show back face"}
              title={showBack ? "Show front face" : "Show back face"}
            >⟳</button>
          )}
        </div>

        <div className="cdm-body">
          <div className="cdm-head">
            <h3 className="cdm-name">{name}</h3>
            {isCommander && <span className="cdm-cmdr-tag">♛ Commander</span>}
            {isConsidering && <span className="cdm-cmdr-tag cdm-consider-tag">☆ Considering</span>}
          </div>
          {typeLine && <p className="cdm-type muted small">{typeLine}</p>}
          <div className="cdm-meta">
            {data?.mana_cost && <ManaCost cost={data.mana_cost} />}
            {price != null && <span className="badge small">{fmtUsd(price)}</span>}
          </div>

          {/* Why the generator put this card in the deck, when it did. */}
          {buildNote && <p className="cdm-why">{buildNote}</p>}

          {/* The answers to the two questions, in place (job 4.2). */}
          <div className="cdm-answers" aria-live="polite" ref={answersRef}>
            {why && (
              <div className={`cdm-answer${why.status === "error" ? " is-error" : ""}`}>
                <div className="cdm-answer-q">Why is this here?</div>
                {why.status === "loading" ? <span className="muted small">Thinking…</span> : <p>{why.text}</p>}
              </div>
            )}
            {rules && (
              <div className={`cdm-answer${rules.status === "error" ? " is-error" : ""}`}>
                <div className="cdm-answer-q">{cmdrName ? `Rules with ${cmdrName}` : "Rules"}</div>
                {rules.status === "error" ? <p>{rules.text}</p>
                  : rules.text ? <BotText text={rules.text} />
                  : <span className="muted small">Thinking…</span>}
                {rules.status === "done" && rules.citations.length > 0 && (
                  <div className="cdm-citations">
                    {rules.citations.map((c) => (
                      <span key={c.number} className="cdm-citation" title={c.text}>Rule {c.number}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {isCommander ? (
            <>
              {renderPrintingSwitcher()}
              <div className="cdm-actions">
                {onChangeCommander && (
                  <button className="ghost small" onClick={() => { onChangeCommander(); onClose(); }}>Change commander</button>
                )}
                {rulesButton}
                <a className="ghost small" href={scryfallUrl(name)} target="_blank" rel="noopener noreferrer">Scryfall ↗</a>
              </div>
            </>
          ) : isConsidering ? (
            <div className="cdm-actions">
              {onAddToDeck && (
                <button className="primary small" onClick={() => { onAddToDeck(name); onClose(); }}>+ Add to deck</button>
              )}
              {whyButton}
              {rulesButton}
              <a className="ghost small" href={scryfallUrl(name)} target="_blank" rel="noopener noreferrer">Scryfall ↗</a>
              {onRemove && (
                <button className="ghost small btn-danger" onClick={() => { onRemove(name); onClose(); }}>Remove</button>
              )}
            </div>
          ) : (
            <>
              {onSetQty && (
                <div className="cdm-row">
                  <span className="cdm-row-label">Quantity</span>
                  <div className="cdm-stepper">
                    <button onClick={() => onSetQty(name, Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Decrease quantity">−</button>
                    <span className="cdm-qty-val">{qty}</span>
                    <button onClick={() => onSetQty(name, qty + 1)} aria-label="Increase quantity">+</button>
                  </div>
                </div>
              )}

              {categories && categories.length > 0 && onMove && (
                <div className="cdm-row">
                  <span className="cdm-row-label">Category</span>
                  <select
                    className="cdm-cat-select"
                    value={currentCategory || ""}
                    onChange={(e) => { onMove(name, e.target.value); }}
                    aria-label="Move card to category"
                  >
                    {!currentCategory && <option value="" disabled>Move to…</option>}
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {renderPrintingSwitcher()}

              <div className="cdm-actions">
                {canBeCommander && (
                  <button className="primary small" onClick={() => { onMakeCommander(name); onClose(); }}>♛ Make commander</button>
                )}
                {onConsider && (
                  <button className="ghost small" onClick={() => { onConsider(name); onClose(); }}>Considering</button>
                )}
                {whyButton}
                {rulesButton}
                <a className="ghost small" href={scryfallUrl(name)} target="_blank" rel="noopener noreferrer">Scryfall ↗</a>
                {onRemove && (
                  <button className="ghost small btn-danger" onClick={() => { onRemove(name); onClose(); }}>Remove</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
