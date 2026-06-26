import { useState, useRef, useEffect } from "react";
import { postStream } from "../lib/api";
import { sanitizeHtml } from "../lib/sanitize";

const CHIPS = [
  "Can I counter a triggered ability?",
  "How does priority work?",
  "Replacement vs triggered effects",
  "Commander damage rules",
];

export default function Rules({ aiAvailable, notify }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const threadRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, streamText]);

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
    <div>
      {/* Header */}
      <div className="rules-header">
        <h2>Rules Q&amp;A</h2>
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
                <div
                  className="rules-msg-ai-text"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.text) }}
                />
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
              <div
                className="rules-msg-ai-text"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(streamText) }}
              />
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
            Ask ✨
          </button>
        </div>
        <div className="rules-footer">
          Answers cite the Magic Comprehensive Rules · Powered by Claude
        </div>
      </div>
    </div>
  );
}
