import { useEffect, useRef, useState } from "react";
import { api, assembleDecklist } from "../lib/api";

export default function Planeswalker({ decklist, commander, format, bracket, aiAvailable, serverStatus, addCard, removeCard, notify }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Welcome message on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: commander
          ? `I'm the Planeswalker — your deck-building companion. I can see your ${commander} deck. Ask me anything: suggest cuts, fill gaps, answer rules questions, or evaluate combos.`
          : "I'm the Planeswalker — your deck-building companion. Load a deck and I can help you with cuts, fills, rules questions, combo guidance, and strategy. Or just ask me anything about MTG!",
      }]);
    }
  }, [open, commander, messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg = { role: "user", content: text };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setBusy(true);

    try {
      const full = assembleDecklist(decklist || "", commander || "");
      const apiMsgs = newMsgs.filter((m) => m.role !== "system").map((m) => ({
        role: m.role, content: m.content,
      }));

      const r = await api.planeswalkerChat(apiMsgs, full, format, commander, bracket);
      if (r.error) {
        setMessages([...newMsgs, { role: "assistant", content: `Error: ${r.response}` }]);
      } else {
        const reply = r.response;
        setMessages([...newMsgs, { role: "assistant", content: reply }]);

        // Detect if the response contains a decklist (lines like "1 Card Name")
        const deckLines = (reply || "").split("\n").filter((l) => /^\d+\s+[A-Z]/.test(l.trim()));
        if (deckLines.length >= 10) {
          setMessages([...newMsgs,
            { role: "assistant", content: reply },
            { role: "system", content: "_deck_detected_", deckLines: deckLines.join("\n") },
          ]);
          return;
        }
      }
    } catch (e) {
      setMessages([...newMsgs, { role: "assistant", content: `Connection error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function clearChat() {
    setMessages([]);
  }

  if (!aiAvailable) return null;

  return (
    <>
      <button className="planeswalker-btn" onClick={() => setOpen(!open)}
        aria-label="Open Planeswalker assistant">
        {open ? "✕" : "⚡"}
      </button>

      {open && (
        <div className="planeswalker-panel">
          <div className="planeswalker-header">
            <div>
              <strong>Planeswalker</strong>
              {commander && <span className="muted small" style={{ marginLeft: ".4rem" }}>{commander}</span>}
            </div>
            <div className="row" style={{ gap: ".3rem" }}>
              <button className="ghost small" onClick={clearChat}>Clear</button>
              <button className="ghost small" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          <div className="planeswalker-messages" ref={scrollRef}>
            {messages.filter((m) => m.role !== "system").map((m, i) => (
              <div key={i} className={`pw-msg pw-${m.role}`}>
                <div className="pw-label">{m.role === "user" ? "You" : "Planeswalker"}</div>
                <div className="pw-text">{m.content}</div>
              </div>
            ))}
            {messages.some((m) => m.content === "_deck_detected_") && (
              <div className="pw-msg pw-assistant">
                <button className="primary small" onClick={() => {
                  const dm = messages.find((m) => m.content === "_deck_detected_");
                  if (dm?.deckLines && addCard) {
                    dm.deckLines.split("\n").forEach((l) => {
                      const match = l.trim().match(/^\d+\s+(.+)$/);
                      if (match) addCard(match[1].trim());
                    });
                    notify("Deck loaded from Planeswalker!");
                  }
                }}>Load this deck into Build</button>
              </div>
            )}
            {busy && (
              <div className="pw-msg pw-assistant">
                <div className="pw-label">Planeswalker</div>
                <div className="pw-text"><span className="loading-dot" /> Thinking...</div>
              </div>
            )}
          </div>

          <div className="planeswalker-input">
            {serverStatus && serverStatus !== "ready" ? (
              <div className="pw-waking">Server is waking up — hang tight...</div>
            ) : (
              <>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Ask about cuts, fills, rules, combos..."
                  disabled={busy}
                />
                <button className="primary" onClick={send} disabled={busy || !input.trim()}>
                  Send
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
