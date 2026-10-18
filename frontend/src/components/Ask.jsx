import { useEffect, useRef, useState } from "react";
import { api, assembleDecklist, getCardImage, EMPTY_REPLY } from "../lib/api";
import { commanderDisplay } from "../lib/deckParser";
import { useMediaQuery, useFocusTrap } from "../lib/hooks";
import { goalsToApi } from "../lib/goals";
import { loadLog, appendLog, describeEntry, makeEntry, isVisibleEntry } from "../lib/optimizeLog";
import { useBackClose } from "../lib/backstack";
import { BotText } from "./BotText";

// Pre-built prompts fired by the quick-action chips (deck loaded only).
const QUICK_ACTIONS = [
  ["Suggest cuts", "Suggest 3 cards I should cut from this deck and why."],
  ["Fill gaps", "What gaps does this deck have (draw, ramp, removal, wincons)? Suggest specific cards to fill them."],
  ["Find combos", "What combos or strong synergy packages exist in this deck? Any near-misses that are one card away?"],
  ["Rate my deck", "Rate this deck's power level and bracket. What are its biggest strengths and weaknesses?"],
  ["Budget swaps", "Suggest budget swaps for the most expensive cards in this deck without losing much power."],
];

// Quick actions shown before any deck is loaded — general MTG helper mode.
const NO_DECK_ACTIONS = [
  ["Upgrade a precon", "I have a preconstructed Commander deck I want to upgrade. Ask me which precon it is, then help me plan about 10 swaps that keep its bracket."],
  ["Rules question", "I have a rules question about a specific interaction. Ask me for the details, then answer with rule citations."],
  ["What can you do?", "What can you help me with in this app? Keep it brief."],
];

const HISTORY_CAP = 40;
const HISTORY_SENT = 20; // messages sent to the API per turn
// Still `pwchat`: the drawer was the Planeswalker chat, and renaming the key
// would drop everyone's saved conversations.
const historyKey = (deckId) => `mtgweb:pwchat:${deckId || "global"}`;

function loadHistory(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(key, messages) {
  try {
    const persistable = messages
      .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "divider")
      .slice(-HISTORY_CAP)
      // Chip verdicts go stale when the deck or commander changes, so they are
      // never persisted: reloaded history chips render without add buttons.
      .map((m) => ({ ...m, cardStatus: undefined }));
    if (persistable.length) localStorage.setItem(key, JSON.stringify(persistable));
    else localStorage.removeItem(key);
  } catch { /* storage full/blocked — history is best-effort */ }
}

// The Ask drawer (UX overhaul job 4.1, `Pick-Deck` and `C-Phone`): a docked
// panel on the right that pushes the page on desktop, a sheet on phones,
// opened from the Ask button in the bar. It sees the deck that is open. App
// owns whether it is open and hides it on the Rules page.
export default function Ask({
  open, onClose,
  decklist, commander, format, bracket, aiAvailable, serverStatus,
  addCard, addToConsidering, notify,
  deckId, deckName, goals,
}) {
  const storageKey = historyKey(deckId);
  // Loaded (and re-loaded on deck switch) by the storageKey effect below.
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Chat text size, persisted across sessions.
  const [bigText, setBigText] = useState(() => localStorage.getItem("mtgweb:pwtext") === "lg");
  // Optimize session log, pinned above the chat so long conversations keep
  // track of what's been applied (list applies + chat card-chip adds).
  const [optLog, setOptLog] = useState([]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  // Bottom-sheet drag (mobile): live translateY while the grabber is dragged.
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef(null); // { startY, dy }
  const isMobile = useMediaQuery("(max-width: 699px)");
  const hasDeck = /^\s*\d+\s+\S/m.test(decklist || "");
  // Mobile: the panel is a full-screen sheet — the back gesture closes it.
  useBackClose(open && isMobile, onClose);
  // And it is a dialog: Tab stays inside it. (On a desktop it stays an aside beside the page.)
  const trapRef = useFocusTrap(open && isMobile);

  // Swap history when the active deck changes — syncing FROM localStorage.
  useEffect(() => {
    setMessages(loadHistory(storageKey)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [storageKey]);

  // Persist completed exchanges (not per-token updates).
  useEffect(() => {
    if (!busy) saveHistory(storageKey, messages);
  }, [messages, busy, storageKey]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    // The docked drawer (desktop) closes only for an Escape pressed inside it: it stays
    // open while a modal or menu over the page handles its own Escape. The phone's sheet
    // is the whole task, so Escape closes it from anywhere, unless another dialog is open
    // over it, which handles its own Escape.
    function onKey(e) {
      if (e.key !== "Escape") return;
      const inside = panelRef.current?.contains(e.target);
      const otherDialog = document.querySelector('[aria-modal="true"]:not(#ask-panel)');
      if (inside || (isMobile && !otherDialog)) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, isMobile, onClose]);

  // The box grows with what is typed; an empty box goes back to one line.
  useEffect(() => {
    if (!input && inputRef.current) inputRef.current.style.height = "";
  }, [input]);

  // Focus goes to the question box on open and back to the Ask button on close.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    inputRef.current?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, [open]);

  // Mobile: the panel is a sheet — lock the page behind it.
  useEffect(() => {
    if (!open || !isMobile) return undefined;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open, isMobile]);

  // Session log: load on open/deck switch, follow writes from any surface
  // (optimizeLog broadcasts "mtgweb:optlog" on every save).
  useEffect(() => {
    if (!open) return undefined;
    setOptLog(loadLog(deckId).filter(isVisibleEntry)); // eslint-disable-line react-hooks/set-state-in-effect
    const onLog = () => setOptLog(loadLog(deckId).filter(isVisibleEntry));
    window.addEventListener("mtgweb:optlog", onLog);
    return () => window.removeEventListener("mtgweb:optlog", onLog);
  }, [open, deckId]);

  // Bottom-sheet gestures (mobile grabber): drag down dismisses.
  function onGrabStart(e) {
    dragRef.current = { startY: e.touches[0].clientY, dy: 0 };
  }
  function onGrabMove(e) {
    if (!dragRef.current) return;
    const dy = e.touches[0].clientY - dragRef.current.startY;
    dragRef.current.dy = dy;
    setDragY(Math.max(0, dy)); // panel follows downward drags only
  }
  function onGrabEnd() {
    const dy = dragRef.current?.dy ?? 0;
    dragRef.current = null;
    setDragY(0);
    if (dy > 80) onClose();
  }

  function toggleTextSize() {
    setBigText((b) => {
      try { localStorage.setItem("mtgweb:pwtext", b ? "" : "lg"); } catch { /* best-effort */ }
      return !b;
    });
  }

  async function send(promptText, topicLabel, baseOverride) {
    const text = (promptText ?? input).trim();
    if (!text || busy) return;
    const userMsg = { role: "user", content: text };
    // Quick actions drop a topic divider so long chats stay scannable.
    const divider = topicLabel ? [{ role: "divider", label: topicLabel }] : [];
    const source = baseOverride ?? messages;
    const base = [...source.filter((m) => m.role !== "system"), ...divider, userMsg];
    setMessages([...base, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setBusy(true);

    const full = assembleDecklist(decklist || "", commander || "");
    const apiMsgs = base
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-HISTORY_SENT)
      .map(({ role, content }) => ({ role, content }));
    const apiGoals = goalsToApi(goals);
    // Session memory: what's already been applied/undone this session, so the
    // bot never re-suggests a change the user already made or rejected.
    const recentChanges = loadLog(deckId)
      .slice(-20)
      .map((e) => `${e.action}: ${describeEntry(e)}`);

    const finish = (finalText, isError = false, model = null) => {
      const aMsg = {
        role: "assistant",
        content: finalText,
        ...(model ? { model } : {}),
        ...(isError ? { error: true, retryText: text } : {}),
      };
      let msgs = [...base, aMsg];
      if (!isError) {
        // Full-decklist detection (lines like "1 Card Name") → offer to load it.
        const deckLines = (finalText || "").split("\n").filter((l) => /^\d+\s+[A-Z]/.test(l.trim()));
        if (deckLines.length >= 10) {
          msgs = [...msgs, { role: "system", content: "_deck_detected_", deckLines: deckLines.join("\n") }];
        }
        // One server check per reply: exact name, legal, on-color, not already
        // in. Only "ok" chips get add buttons; if the check fails, none do
        // (fail closed). Unknown names render as plain text.
        const chipNames = [...new Set(
          [...(finalText || "").matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()),
        )].filter((n) => n && n.length <= 100).slice(0, 40);
        if (chipNames.length) {
          chipNames.forEach((n) => getCardImage(n).catch(() => {})); // prewarm hover previews
          api.validateCards(full, format, chipNames)
            .then((r) => Object.fromEntries((r?.results || []).map((x) => [x.input, x])))
            .catch(() => ({}))
            .then((cardStatus) => {
              setMessages((cur) => cur.map((m) => (m === aMsg ? { ...m, cardStatus } : m)));
            });
        }
      }
      setMessages(msgs);
    };

    try {
      let acc = "";
      let modelUsed = null;
      let streamError = null;
      await api.planeswalkerChatStream(apiMsgs, full, format, commander, bracket, apiGoals, recentChanges, (chunk) => {
        if (chunk.status === "streaming" && chunk.text) {
          acc += chunk.text;
          setMessages([...base, { role: "assistant", content: acc, streaming: true }]);
        } else if (chunk.status === "done") {
          acc = chunk.text || acc;
          modelUsed = chunk.model || null;
        } else if (chunk.status === "error") {
          streamError = chunk.message || "AI request failed.";
        }
      });
      if (streamError) finish(`Error: ${streamError}`, true);
      // An empty "done" would render as the Thinking… placeholder forever.
      else if (!acc.trim()) finish(`Error: ${EMPTY_REPLY}`, true);
      else finish(acc, false, modelUsed);
    } catch {
      // Streaming endpoint unreachable — fall back to the non-streaming API.
      try {
        const r = await api.planeswalkerChat(apiMsgs, full, format, commander, bracket, apiGoals, recentChanges);
        if (r.error) finish(`Error: ${r.response}`, true, r.model || null);
        else if (!(r.response || "").trim()) finish(`Error: ${EMPTY_REPLY}`, true);
        else finish(r.response, false, r.model || null);
      } catch (e2) {
        finish(`Connection error: ${e2.message}`, true);
      }
    } finally {
      setBusy(false);
    }
  }

  // Re-send a failed message: drop the trailing error bubble (and the user
  // message that produced it) so the retried exchange doesn't duplicate.
  function retry(text) {
    const trimmed = [...messages];
    while (trimmed.length && trimmed[trimmed.length - 1].role !== "user") trimmed.pop();
    if (trimmed.length && trimmed[trimmed.length - 1].role === "user") trimmed.pop();
    send(text, null, trimmed);
  }

  // A detected decklist is AI output: both "Load into deck" and "Add to
  // Considering" validate first (40 names per call) and add only "ok" cards,
  // under their canonical names.
  async function addAllValidated(deckLines, add, where) {
    const names = [...new Set((deckLines || "").split("\n")
      .map((l) => l.trim().match(/^\d+\s+(.+)$/)?.[1].trim())
      .filter((n) => n && n.length <= 100))];
    if (!names.length) return;
    const full = assembleDecklist(decklist || "", commander || "");
    try {
      const chunks = [];
      for (let i = 0; i < names.length; i += 40) chunks.push(names.slice(i, i + 40));
      const res = await Promise.all(chunks.map((c) => api.validateCards(full, format, c)));
      const ok = res.flatMap((r) => r.results).filter((x) => x.status === "ok").map((x) => x.name);
      ok.forEach(add);
      const skipped = names.length - ok.length;
      notify(`Added ${ok.length} to ${where}${skipped ? ` (${skipped} skipped: in deck, off-color, not legal or unknown)` : ""}`);
    } catch {
      notify("Couldn't check those cards — nothing added.");
    }
  }

  function clearChat() {
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch { /* best-effort */ }
  }

  // When AI is off, the input area explains it instead of hiding the drawer.
  const aiOff = !aiAvailable && serverStatus === "ready";

  // Chat card-chip adds land in the same session log as list applies, so the
  // pinned log (and Improve's log, via the broadcast) records chat changes too.
  const chipActions = {
    onAdd: addCard
      ? (name) => {
          addCard(name);
          appendLog(deckId, makeEntry({ action: "add", add: name, source: "chat" }));
        }
      : null,
    onConsider: addToConsidering || null,
    notify,
  };
  const deckDetected = messages.find((m) => m.content === "_deck_detected_");
  const asked = messages.some((m) => m.role === "user");
  const subject = deckName || (commander ? commanderDisplay(commander) : null);
  const starters = hasDeck
    ? [
        "What should my first three turns look like?",
        "Which cards are doing the least work here?",
        commander
          ? `What does ${commanderDisplay(commander)} do best in this deck?`
          : "What is the plan for winning with this deck?",
      ]
    : [];

  if (!open) return null;

  return (
    <aside
      id="ask-panel"
      ref={(el) => { panelRef.current = el; trapRef.current = el; }}
      className={`ask-panel${bigText ? " pw-textlg" : ""}`}
      aria-label="Ask"
      role={isMobile ? "dialog" : undefined}
      aria-modal={isMobile ? "true" : undefined}
      tabIndex={isMobile ? -1 : undefined}
      style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
    >
      {isMobile && (
        <div
          className="pw-grabber"
          onTouchStart={onGrabStart}
          onTouchMove={onGrabMove}
          onTouchEnd={onGrabEnd}
          aria-hidden="true"
        >
          <span />
        </div>
      )}
      <div className="ask-header">
        <div>
          <h2 className="ask-title">Ask</h2>
          <div className="ask-sub">{subject ? `About ${subject}` : "Rules, cards and deck ideas"}</div>
        </div>
        <div className="ask-header-act">
          <button className={`ghost small pw-asize${bigText ? " active" : ""}`} onClick={toggleTextSize}
            aria-label={bigText ? "Smaller chat text" : "Larger chat text"} title="Text size">
            <span aria-hidden="true">A</span><span aria-hidden="true" className="pw-asize-big">A</span>
          </button>
          <button className="ghost small" onClick={clearChat}>Clear</button>
          <button className="ghost ask-close" onClick={onClose} aria-label="Close Ask">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          </button>
        </div>
      </div>

      <div className="ask-messages" ref={scrollRef} aria-live="polite" aria-relevant="additions">
        {optLog.length > 0 && (
          <details className="pw-sessionlog">
            <summary>Session changes ({optLog.length})</summary>
            <div className="pw-sessionlog-body">
              {[...optLog].reverse().map((e) => (
                <div key={e.id} className="pw-sessionlog-row">
                  <span className={`opt-badge opt-act-${e.action}`}>{e.action}</span>
                  <span className="pw-sessionlog-desc">{describeEntry(e)}</span>
                  {e.source === "chat" && <span className="pw-sessionlog-src">chat</span>}
                </div>
              ))}
            </div>
          </details>
        )}
        {!asked && (
          <div className="ask-intro">
            <p>
              {hasDeck
                ? "Ask about this deck, a card in it, or a rule. It can see the list you have open."
                : "Ask about a card, a rule or a deck idea. Open a deck and it can see the list."}
            </p>
            {!aiOff && serverStatus !== "offline" && serverStatus !== "waking" && starters.map((q) => (
              <button key={q} type="button" className="ask-starter" disabled={busy} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.filter((m) => m.role !== "system").map((m, i) => (
          m.role === "divider" ? (
            <div key={i} className="pw-divider" role="separator"><span>{m.label}</span></div>
          ) : (
          <div key={i} className={`pw-msg pw-${m.role}`}>
            <div className="pw-label">
              {m.role === "user" ? "You" : "Ask"}
              {m.role === "assistant" && /haiku/i.test(m.model || "") && (
                <span className="pw-model-badge" title="Answered by the fallback model — retry later for full quality">Haiku</span>
              )}
            </div>
            {m.role === "assistant"
              ? (m.content
                  ? <BotText text={m.content} actions={chipActions} cardStatus={m.cardStatus} />
                  : <div className="pw-text"><span className="loading-dot" /> Thinking…</div>)
              : <div className="pw-text">{m.content}</div>}
            {m.role === "assistant" && m.error && m.retryText && !busy && (
              <button className="ghost small pw-retry" onClick={() => retry(m.retryText)}>↻ Retry</button>
            )}
          </div>
          )
        ))}
        {deckDetected && (
          <div className="pw-msg pw-assistant" style={{ display: "flex", gap: ".3rem", flexWrap: "wrap" }}>
            {addCard && (
              <button className="primary small" onClick={() => addAllValidated(deckDetected.deckLines, addCard, "the deck")}>Load into deck</button>
            )}
            {addToConsidering && (
              <button className="ghost small" onClick={() => addAllValidated(deckDetected.deckLines, addToConsidering, "Considering")}>
                Add to Considering
              </button>
            )}
          </div>
        )}
      </div>

      {!aiOff && serverStatus !== "offline" && serverStatus !== "waking" && (
        <div className="pw-chips" role="group" aria-label="Quick actions">
          {(hasDeck ? QUICK_ACTIONS : NO_DECK_ACTIONS).map(([label, prompt]) => (
            <button key={label} className="pw-chip" disabled={busy} onClick={() => send(prompt, label)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="ask-input">
        {serverStatus === "offline" ? (
          <div className="pw-waking">Server is offline — click the banner above to retry.</div>
        ) : serverStatus === "waking" ? (
          <div className="pw-waking">Server is waking up — hang tight…</div>
        ) : aiOff ? (
          <div className="pw-waking">AI chat isn't set up on this server.</div>
        ) : (
          <>
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-grow up to ~4 lines, then scroll inside.
                e.target.style.height = "";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 104)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Ask a question"
              aria-label="Your question"
              disabled={busy}
            />
            <button className="primary" onClick={() => send()} disabled={busy || !input.trim()}>
              Send
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
