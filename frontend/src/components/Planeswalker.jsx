import { useEffect, useMemo, useRef, useState } from "react";
import { api, assembleDecklist } from "../lib/api";

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

export default function Planeswalker({ decklist, commander, format, bracket, aiAvailable, serverStatus, addCard, addToConsidering, removeCard, notify }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const chibiArt = useMemo(() => CHIBI_ART[Math.floor(Math.random() * CHIBI_ART.length)], []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Welcome message on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: commander
          ? `I'm the Planeswalker — your deck-building companion. I can see your ${commander.replace(" && ", " + ")} deck. Ask me anything: suggest cuts, fill gaps, answer rules questions, or evaluate combos.`
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
        aria-label={open ? "Close Planeswalker assistant" : "Open Planeswalker assistant"}>
        {open ? "✕" : <img src={chibiArt} alt="" className="pw-chibi" />}
      </button>

      {open && (
        <div className="planeswalker-panel">
          <div className="planeswalker-header">
            <div>
              <strong>Planeswalker</strong>
              {commander && <span className="muted small" style={{ marginLeft: ".4rem" }}>{commander.replace(" && ", " + ")}</span>}
            </div>
            <div className="row" style={{ gap: ".3rem" }}>
              <button className="ghost small" onClick={clearChat}>Clear</button>
              <button className="ghost small" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          <div className="planeswalker-messages" ref={scrollRef} aria-live="polite" aria-relevant="additions">
            {messages.filter((m) => m.role !== "system").map((m, i) => (
              <div key={i} className={`pw-msg pw-${m.role}`}>
                <div className="pw-label">{m.role === "user" ? "You" : "Planeswalker"}</div>
                <div className="pw-text">{m.content}</div>
              </div>
            ))}
            {messages.some((m) => m.content === "_deck_detected_") && (
              <div className="pw-msg pw-assistant" style={{ display: "flex", gap: ".3rem", flexWrap: "wrap" }}>
                <button className="primary small" onClick={() => {
                  const dm = messages.find((m) => m.content === "_deck_detected_");
                  if (dm?.deckLines && addCard) {
                    dm.deckLines.split("\n").forEach((l) => {
                      const match = l.trim().match(/^\d+\s+(.+)$/);
                      if (match) addCard(match[1].trim());
                    });
                    notify("Deck loaded from Planeswalker!");
                  }
                }}>Load into deck</button>
                {addToConsidering && (
                  <button className="ghost small" onClick={() => {
                    const dm = messages.find((m) => m.content === "_deck_detected_");
                    if (dm?.deckLines) {
                      let n = 0;
                      dm.deckLines.split("\n").forEach((l) => {
                        const match = l.trim().match(/^\d+\s+(.+)$/);
                        if (match) { addToConsidering(match[1].trim()); n++; }
                      });
                      notify(`Added ${n} cards to consider`);
                    }
                  }}>Add to Considering</button>
                )}
              </div>
            )}
            {busy && (
              <div className="pw-msg pw-assistant">
                <div className="pw-label">Planeswalker</div>
                <div className="pw-text"><span className="loading-dot" /> Thinking…</div>
              </div>
            )}
          </div>

          <div className="planeswalker-input">
            {serverStatus === "offline" ? (
              <div className="pw-waking">Server is offline — click the banner above to retry.</div>
            ) : serverStatus === "waking" ? (
              <div className="pw-waking">Server is waking up — hang tight…</div>
            ) : (
              <>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Ask about cuts, fills, rules, combos…"
                  aria-label="Message Planeswalker"
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
