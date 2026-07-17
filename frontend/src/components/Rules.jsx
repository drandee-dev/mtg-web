import { useState, useRef, useEffect } from "react";
import { postStream } from "../lib/api";
import { BotText } from "./BotText";

const CHIPS = [
  "Can I counter a triggered ability?",
  "How does priority work?",
  "Replacement vs triggered effects",
  "Commander damage rules",
];

// Q&A history persists across tab switches and reloads (same pattern/cap as
// the Planeswalker chat) — leaving the tab no longer blanks your answers.
const HISTORY_KEY = "mtgweb:ruleschat";
const HISTORY_CAP = 40;

function loadRulesHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRulesHistory(messages) {
  try {
    if (messages.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_CAP)));
    else localStorage.removeItem(HISTORY_KEY);
  } catch { /* storage full/blocked — history is best-effort */ }
}

export default function Rules({ aiAvailable, notify, prefill, onPrefillConsumed }) {
  const [messages, setMessages] = useState(loadRulesHistory);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  // Persist completed exchanges (not per-token stream updates).
  useEffect(() => {
    if (!streaming) saveRulesHistory(messages);
  }, [messages, streaming]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  // Card-modal handoff: arrive with the card queued in the input (editable,
  // not auto-submitted — the user finishes the question). Consuming clears it
  // in App so a later manual visit to this tab doesn't replay a stale card.
  useEffect(() => {
    if (!prefill?.name) return;
    setInput(`How does ${prefill.name} work? `);
    inputRef.current?.focus();
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  async function submit(text) {
    const question = (text || input).trim();
    if (!question || streaming) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setStreaming(true);
    setStreamText("");

    let fullText = "";
    let citations = [];
    let cards = [];

    try {
      await postStream(
        "/api/rules/ask/stream",
        { question },
        (chunk) => {
          if (chunk.status === "streaming") {
            fullText += chunk.text;
            setStreamText(fullText);
          } else if (chunk.status === "done") {
            fullText = chunk.text;
            setStreamText(fullText);
          } else if (chunk.status === "citations") {
            citations = chunk.citations || [];
            cards = chunk.cards || [];
          } else if (chunk.status === "error") {
            notify(chunk.message);
          }
        }
      );

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: fullText, citations, cards },
      ]);
    } catch (e) {
      notify(`Rules query failed: ${e.message}`);
    } finally {
      setStreamText("");
      setStreaming(false);
    }
  }

  function handleChip(text) {
    setInput(text);
    submit(text);
  }

  return (
    <div className="rules-chat">
      {/* Header */}
      <div className="rules-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".6rem" }}>
          <h2>Rules Q&amp;A</h2>
          {messages.length > 0 && !streaming && (
            <button className="ghost small" onClick={() => setMessages([])}>Clear history</button>
          )}
        </div>
        <p>
          Ask any Magic: The Gathering rules question in plain English. Answers
          cite the Comprehensive Rules so you can verify every detail.
        </p>
      </div>

      {/* Quick-ask chips */}
      {messages.length === 0 && !streaming && (
        <div className="rules-chips">
          {CHIPS.map((chip) => (
            <button key={chip} onClick={() => handleChip(chip)}>
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Chat thread */}
      {(messages.length > 0 || streaming) && (
        <div className="rules-thread" ref={threadRef}>
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="rules-msg-user">
                <div className="rules-msg-user-bubble">{msg.text}</div>
              </div>
            ) : (
              <div key={i} className="rules-msg-ai">
                <div className="rules-msg-ai-label">
                  <span className="rules-msg-ai-dot" />
                  <span className="rules-msg-ai-name">MTG Workshop AI</span>
                </div>
                <div className="rules-msg-ai-text">
                  <BotText text={msg.text} />
                </div>
                {msg.citations?.length > 0 && (
                  <div className="rules-citations">
                    {msg.citations.map((c, j) => (
                      <button
                        key={j}
                        className="rules-citation"
                        title={c.text}
                      >
                        Rule {c.number} ↗
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {/* Streaming in-progress message */}
          {streaming && streamText && (
            <div className="rules-msg-ai">
              <div className="rules-msg-ai-label">
                <span className="rules-msg-ai-dot" />
                <span className="rules-msg-ai-name">MTG Workshop AI</span>
              </div>
              <div className="rules-msg-ai-text">
                <BotText text={streamText} />
              </div>
            </div>
          )}

          {/* Streaming dots indicator */}
          {streaming && !streamText && (
            <div className="rules-streaming">
              <span className="rules-msg-ai-dot" />
              <span className="rules-streaming-dot" />
              <span className="rules-streaming-dot" />
              <span className="rules-streaming-dot" />
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="rules-input-bar">
        <div className="rules-input-row">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ask a rules question…"
            disabled={streaming}
          />
          <button
            className="rules-ask-btn"
            onClick={() => submit()}
            disabled={streaming || !input.trim()}
          >
            <span className="rules-ask-label">Ask ✨</span>
            <span className="rules-ask-icon">↑</span>
          </button>
        </div>
        <div className="rules-footer">
          Answers cite the Magic Comprehensive Rules · Powered by Claude
        </div>
      </div>
    </div>
  );
}
