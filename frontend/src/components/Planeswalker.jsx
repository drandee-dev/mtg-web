import { useEffect, useMemo, useRef, useState } from "react";
import { api, assembleDecklist, getCardImage } from "../lib/api";
import { commanderDisplay } from "../lib/deckParser";
import { useMediaQuery } from "../lib/hooks";
import { goalsToApi } from "../lib/goals";
import { loadLog, appendLog, describeEntry, makeEntry, isVisibleEntry } from "../lib/optimizeLog";
import { useBackClose } from "../lib/backstack";
import { BotText } from "./BotText";

const CHIBI_ART = [
  "https://cards.scryfall.io/art_crop/front/e/b/ebbfc1b2-2407-4079-a847-6bb6b9a2c9de.jpg",
  "https://cards.scryfall.io/art_crop/front/4/f/4fe22cd8-31e6-491b-bce2-db257668eb92.jpg",
  "https://cards.scryfall.io/art_crop/front/b/a/ba48c787-a444-4e15-bab7-39994a6e23e7.jpg",
  "https://cards.scryfall.io/art_crop/front/d/d/dd6f76d4-a2b3-40e5-b6a7-b27c42caf615.jpg",
  "https://cards.scryfall.io/art_crop/front/7/4/7427e78c-4881-42bd-930c-39aae324fc58.jpg",
  "https://cards.scryfall.io/art_crop/front/d/0/d05b3f79-74d0-4756-b7e7-1cd17685bbb7.jpg",
  "https://cards.scryfall.io/art_crop/front/9/7/97f8d1ca-bc82-453a-b237-ef75ce027b8f.jpg",
  "https://cards.scryfall.io/art_crop/front/f/b/fbbd5627-2f55-4101-981b-49f5f45db578.jpg",
  "https://cards.scryfall.io/art_crop/front/6/3/63e3de28-d6e9-4f27-a544-0434fb4b55bb.jpg",
  "https://cards.scryfall.io/art_crop/front/0/0/000db964-719d-4532-9225-35658565b35d.jpg",
  "https://cards.scryfall.io/art_crop/front/f/a/fa553e54-e6aa-499b-ac48-0cdbf6c37734.jpg",
  "https://cards.scryfall.io/art_crop/front/5/6/5662d0a5-3222-4ab9-9e15-f06477730b75.jpg",
  "https://cards.scryfall.io/art_crop/front/1/d/1df8d25e-e519-4197-aa8e-ec596cb2a2d8.jpg",
  "https://cards.scryfall.io/art_crop/front/d/2/d25c3609-a200-4532-9df8-8e92c24544bc.jpg",
  "https://cards.scryfall.io/art_crop/front/5/2/5284b87f-d249-43c2-a198-dd03e961bedb.jpg",
  "https://cards.scryfall.io/art_crop/front/8/a/8a2813cb-c73c-4a50-b278-2f13deb71773.jpg",
];

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
      .slice(-HISTORY_CAP);
    if (persistable.length) localStorage.setItem(key, JSON.stringify(persistable));
    else localStorage.removeItem(key);
  } catch { /* storage full/blocked — history is best-effort */ }
}

export default function Planeswalker({
  decklist, commander, format, bracket, aiAvailable, serverStatus,
  addCard, addToConsidering, notify,
  deckId, insightsAvailable, onInsightsSlot, onStatsSlot, goals,
}) {
  const [open, setOpen] = useState(false);
  const [tabView, setTabView] = useState("chat"); // "chat" | "insights" (Optimize) | "stats"
  const storageKey = historyKey(deckId);
  // Loaded (and re-loaded on deck switch) by the storageKey effect below.
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Panel size + chat text size, both persisted across sessions.
  const [expanded, setExpanded] = useState(() => localStorage.getItem("mtgweb:pwexpand") === "1");
  const [bigText, setBigText] = useState(() => localStorage.getItem("mtgweb:pwtext") === "lg");
  // Optimize session log, pinned above the chat so long conversations keep
  // track of what's been applied (queue applies + chat card-chip adds).
  const [optLog, setOptLog] = useState([]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  // Bottom-sheet drag (mobile): live translateY while the grabber is dragged.
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef(null); // { startY, dy }
  const chibiArt = useMemo(() => CHIBI_ART[Math.floor(Math.random() * CHIBI_ART.length)], []);
  const isMobile = useMediaQuery("(max-width: 699px)");
  // Insights tab: mobile-only (desktop always has the deck sidebar in view).
  const showInsights = Boolean(insightsAvailable) && isMobile;
  const hasDeck = /^\s*\d+\s+\S/m.test(decklist || "");
  // Mobile: the panel is a full-screen sheet — the back gesture closes it.
  useBackClose(open && isMobile, () => setOpen(false));

  // First-contact badge — the FAB is unlabeled art, so until the chat has been
  // opened once (ever), pulse a dot + "Ask why" tag when a deck is in view.
  const [pwSeen, setPwSeen] = useState(() => {
    try { return localStorage.getItem("mtgweb:pwseen") === "1"; } catch { return true; }
  });
  const showFirstContact = !pwSeen && !open && hasDeck && Boolean(insightsAvailable);
  function markSeen() {
    if (pwSeen) return;
    setPwSeen(true);
    try { localStorage.setItem("mtgweb:pwseen", "1"); } catch { /* best-effort */ }
  }

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
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Mobile: the panel is a full-width sheet — lock the page behind it.
  useEffect(() => {
    if (!open || !isMobile) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open, isMobile]);

  // If the deck tab goes away while Optimize/Stats is showing, fall back to chat.
  useEffect(() => {
    if (!showInsights && tabView !== "chat") setTabView("chat"); // eslint-disable-line react-hooks/set-state-in-effect
  }, [showInsights, tabView]);

  // Session log: load on open/deck switch, follow writes from any surface
  // (optimizeLog broadcasts "mtgweb:optlog" on every save).
  useEffect(() => {
    if (!open) return;
    setOptLog(loadLog(deckId).filter(isVisibleEntry)); // eslint-disable-line react-hooks/set-state-in-effect
    const onLog = () => setOptLog(loadLog(deckId).filter(isVisibleEntry));
    window.addEventListener("mtgweb:optlog", onLog);
    return () => window.removeEventListener("mtgweb:optlog", onLog);
  }, [open, deckId]);

  function setExpandPersist(v) {
    setExpanded(v);
    try { localStorage.setItem("mtgweb:pwexpand", v ? "1" : "0"); } catch { /* best-effort */ }
  }

  function toggleExpand() { setExpandPersist(!expanded); }

  // Bottom-sheet gestures (mobile grabber): drag up snaps to full height,
  // drag down snaps back to the default sheet, then dismisses.
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
    if (dy < -60) setExpandPersist(true);          // swipe up → full screen
    else if (dy > 80 && expanded) setExpandPersist(false); // swipe down → sheet
    else if (dy > 80) setOpen(false);              // swipe down again → close
  }

  function toggleTextSize() {
    setBigText((b) => {
      try { localStorage.setItem("mtgweb:pwtext", b ? "" : "lg"); } catch { /* best-effort */ }
      return !b;
    });
  }

  // Welcome message on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([{
        role: "assistant",
        content: commander
          ? `I'm the Planeswalker — your deck-building companion. I can see your ${commanderDisplay(commander)} deck. Ask me anything: suggest cuts, fill gaps, answer rules questions, or evaluate combos.`
          : "I'm the Planeswalker — your deck-building companion. Load a deck and I can help you with cuts, fills, rules questions, combo guidance, and strategy. Or just ask me anything about MTG!",
      }]);
    }
  }, [open, commander, messages.length]);

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
    if (inputRef.current) inputRef.current.style.height = "";
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
        // Verify [[card]] chips against the card database (batch-cached lookups
        // that also prewarm hover previews); unknown names render as plain text
        // so hallucinated cards never get an Add button.
        const chipNames = [...new Set(
          [...(finalText || "").matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()),
        )];
        if (chipNames.length) {
          Promise.all(chipNames.map((n) => getCardImage(n).then((d) => [n, Boolean(d?.found)])))
            .then((pairs) => {
              const invalid = pairs.filter(([, ok]) => !ok).map(([n]) => n);
              if (invalid.length) {
                setMessages((cur) => cur.map((m) => (m === aMsg ? { ...m, invalidCards: invalid } : m)));
              }
            })
            .catch(() => { /* validation is best-effort — chips stay tappable */ });
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
      else finish(acc, false, modelUsed);
    } catch {
      // Streaming endpoint unreachable — fall back to the non-streaming API.
      try {
        const r = await api.planeswalkerChat(apiMsgs, full, format, commander, bracket, apiGoals, recentChanges);
        finish(r.error ? `Error: ${r.response}` : r.response, Boolean(r.error), r.model || null);
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

  function clearChat() {
    setMessages([]);
    try { localStorage.removeItem(storageKey); } catch { /* best-effort */ }
  }

  // The hub always renders — Insights isn't an AI feature, and hiding the button
  // when the server reports ai_available:false stranded the whole panel. When AI
  // is off, the chat input area explains it instead.
  const aiOff = !aiAvailable && serverStatus === "ready";

  // Chat card-chip adds land in the same session log as queue applies, so the
  // pinned log (and the queue's log, via the broadcast) records chat changes too.
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

  return (
    <>
      <button className={`planeswalker-btn${showFirstContact ? " pw-first-contact" : ""}`}
        onClick={() => { markSeen(); setOpen(!open); }}
        aria-label={open ? "Close Planeswalker assistant" : "Open Planeswalker assistant"}>
        {open ? "✕" : <img src={chibiArt} alt="" className="pw-chibi" />}
        {showFirstContact && <span className="pw-fc-dot" aria-hidden="true" />}
      </button>
      {showFirstContact && (
        <span className="pw-fc-tag" aria-hidden="true">Ask why ✨</span>
      )}

      {open && (
        <div
          className={`planeswalker-panel${expanded ? " pw-expanded" : ""}${bigText ? " pw-textlg" : ""}`}
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
          <div className="planeswalker-header">
            <div className="row" style={{ alignItems: "center", gap: ".45rem" }}>
              <img src={chibiArt} alt="" className="pw-header-chibi" />
              <div>
                <strong>Planeswalker</strong>
                {commander && <span className="muted small" style={{ marginLeft: ".4rem" }}>{commanderDisplay(commander)}</span>}
              </div>
            </div>
            <div className="row" style={{ gap: ".3rem" }}>
              {tabView === "chat" && (
                <button className={`ghost small pw-asize${bigText ? " active" : ""}`} onClick={toggleTextSize}
                  aria-label={bigText ? "Smaller chat text" : "Larger chat text"} title="Text size">
                  <span aria-hidden="true">A</span><span aria-hidden="true" className="pw-asize-big">A</span>
                </button>
              )}
              <button className="ghost small" onClick={toggleExpand}
                aria-label={expanded ? "Shrink panel" : "Expand panel"} title={expanded ? "Shrink" : "Expand"}>
                {expanded ? "⤡" : "⤢"}
              </button>
              {tabView === "chat" && <button className="ghost small" onClick={clearChat}>Clear</button>}
              <button className="ghost small" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
          </div>

          {showInsights && (
            <div className="pw-tabs" role="tablist" aria-label="Planeswalker panels">
              <button role="tab" aria-selected={tabView === "chat"}
                className={tabView === "chat" ? "active" : ""}
                onClick={() => setTabView("chat")}>Chat</button>
              <button role="tab" aria-selected={tabView === "insights"}
                className={tabView === "insights" ? "active" : ""}
                onClick={() => setTabView("insights")}>Optimize</button>
              <button role="tab" aria-selected={tabView === "stats"}
                className={tabView === "stats" ? "active" : ""}
                onClick={() => setTabView("stats")}>Stats</button>
            </div>
          )}

          {tabView === "insights" ? (
            /* DeckView portals its DeckSidebar (optimize section) here. */
            <div className="pw-insights-body" ref={onInsightsSlot || undefined} />
          ) : tabView === "stats" ? (
            /* DeckView portals its DeckSidebar (stats section) here. */
            <div className="pw-insights-body" ref={onStatsSlot || undefined} />
          ) : (
            <>
              <div className="planeswalker-messages" ref={scrollRef} aria-live="polite" aria-relevant="additions">
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
                {messages.filter((m) => m.role !== "system").map((m, i) => (
                  m.role === "divider" ? (
                    <div key={i} className="pw-divider" role="separator"><span>{m.label}</span></div>
                  ) : (
                  <div key={i} className={`pw-msg pw-${m.role}`}>
                    <div className="pw-label">
                      {m.role === "user" ? "You" : "Planeswalker"}
                      {m.role === "assistant" && /haiku/i.test(m.model || "") && (
                        <span className="pw-model-badge" title="Answered by the fallback model — retry later for full quality">Haiku</span>
                      )}
                    </div>
                    {m.role === "assistant"
                      ? (m.content
                          ? <BotText text={m.content} actions={chipActions} invalidCards={m.invalidCards} />
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
                    <button className="primary small" onClick={() => {
                      if (deckDetected.deckLines && addCard) {
                        deckDetected.deckLines.split("\n").forEach((l) => {
                          const match = l.trim().match(/^\d+\s+(.+)$/);
                          if (match) addCard(match[1].trim());
                        });
                        notify("Deck loaded from Planeswalker!");
                      }
                    }}>Load into deck</button>
                    {addToConsidering && (
                      <button className="ghost small" onClick={() => {
                        if (deckDetected.deckLines) {
                          let n = 0;
                          deckDetected.deckLines.split("\n").forEach((l) => {
                            const match = l.trim().match(/^\d+\s+(.+)$/);
                            if (match) { addToConsidering(match[1].trim()); n++; }
                          });
                          notify(`Added ${n} cards to consider`);
                        }
                      }}>Add to Considering</button>
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

              <div className="planeswalker-input">
                {serverStatus === "offline" ? (
                  <div className="pw-waking">Server is offline — click the banner above to retry.</div>
                ) : serverStatus === "waking" ? (
                  <div className="pw-waking">Server is waking up — hang tight…</div>
                ) : aiOff ? (
                  <div className="pw-waking">AI chat isn't set up on this server — deck Insights still work.</div>
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
                      placeholder="Ask about cuts, fills, rules, combos…"
                      aria-label="Message Planeswalker"
                      disabled={busy}
                    />
                    <button className="primary" onClick={() => send()} disabled={busy || !input.trim()}>
                      Send
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
