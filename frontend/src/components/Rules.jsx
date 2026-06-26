import { useState } from "react";
import { api } from "../lib/api";
import { postStream } from "../lib/api";
import LoadingIndicator from "./LoadingIndicator";

export default function Rules({ aiAvailable, notify }) {
  const [mode, setMode] = useState("term");
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [aiRes, setAiRes] = useState(null);
  const [streamText, setStreamText] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      if (mode === "ask") {
        setRes(null);
        setAiRes(null);
        setStreamText("");

        let fullText = "";
        let citations = [];
        let cards = [];
        let model = "";

        await postStream("/api/rules/ask/stream",
          { question: q.trim() },
          (chunk) => {
            if (chunk.status === "streaming") {
              fullText += chunk.text;
              setStreamText(fullText);
            } else if (chunk.status === "done") {
              fullText = chunk.text;
              model = chunk.model || "";
              setStreamText(fullText);
            } else if (chunk.status === "citations") {
              citations = chunk.citations || [];
              cards = chunk.cards || [];
            } else if (chunk.status === "error") {
              notify(chunk.message);
            }
          }
        );

        setAiRes({
          error: false,
          answer: fullText,
          citations,
          cards,
          model,
          rules_searched: citations.length,
        });
      } else {
        setAiRes(null);
        setStreamText("");
        const params = { [mode]: q.trim() };
        if (mode === "grep") params.limit = 10;
        setRes(await api.rules(params));
      }
    } catch (e) {
      notify(`Lookup failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>Rules lookup</h2>
        <div className="row">
          <select value={mode} onChange={(e) => { setMode(e.target.value); setRes(null); setAiRes(null); setStreamText(""); }} style={{ width: "auto" }}>
            <option value="term">Glossary term</option>
            <option value="rule">Rule number</option>
            <option value="grep">Search text</option>
            {aiAvailable && <option value="ask">Ask a question ✨</option>}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder={
              mode === "rule" ? "702.19a"
                : mode === "term" ? "trample"
                  : mode === "ask" ? "Can I counter a triggered ability?"
                    : "double strike"
            }
            style={{ flex: "1 1 200px" }}
          />
          <button className="primary" onClick={run} disabled={busy}>
            {busy ? (mode === "ask" ? "Asking…" : "Looking up…") : mode === "ask" ? "Ask" : "Look up"}
          </button>
        </div>
        {mode === "ask" && (
          <p className="muted small" style={{ marginTop: ".4rem" }}>
            Ask any rules question in plain English — powered by Claude, with the relevant rules cited underneath.
          </p>
        )}
      </div>

      {/* Loading indicator for deterministic lookups */}
      {busy && mode !== "ask" && <LoadingIndicator label="Looking up" />}

      {/* Free lookup results */}
      {res && (
        <div className="panel">
          {res.effective_date && <p className="muted small">CR effective {res.effective_date}</p>}
          {res.mode === "term" && (res.match
            ? <RuleEntry title={res.match.term}>{res.match.definition}{seeRules(res.match.see_rules)}</RuleEntry>
            : <p className="muted">No glossary term "{res.query}".</p>)}
          {res.mode === "rule" && (res.match
            ? <RuleEntry title={res.match.number}>{res.match.text || res.match.title}{examples(res.match.examples)}{seeRules(res.match.see_rules)}</RuleEntry>
            : <p className="muted">No rule {res.query}.</p>)}
          {res.mode === "grep" && (res.matches?.length
            ? res.matches.map((m) => <RuleEntry key={m.number} title={`${m.number} [${m.kind}]`}>{m.snippet}</RuleEntry>)
            : <p className="muted">No matches for "{res.query}".</p>)}
        </div>
      )}

      {/* Streaming AI answer */}
      {busy && mode === "ask" && streamText && (
        <div className="panel">
          <h3>Answer</h3>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{streamText}<span className="loading-dot" style={{ display: "inline-block", marginLeft: ".3rem" }} /></div>
        </div>
      )}
      {busy && mode === "ask" && !streamText && <LoadingIndicator label="Thinking" />}

      {/* Final AI Q&A result */}
      {!busy && aiRes && !aiRes.error && (
        <div className="panel">
          <h3>Answer</h3>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{aiRes.answer}</div>

          {aiRes.cards?.length > 0 && (
            <>
              <h4 style={{ marginTop: "1rem" }}>Cards referenced</h4>
              {aiRes.cards.map((c, i) => (
                <RuleEntry key={i} title={c.name}>{c.oracle_text}</RuleEntry>
              ))}
            </>
          )}

          {aiRes.citations?.length > 0 && (
            <>
              <h4 style={{ marginTop: "1rem" }}>Cited rules</h4>
              {aiRes.citations.map((c, i) => (
                <RuleEntry key={i} title={c.number}>{c.text}</RuleEntry>
              ))}
            </>
          )}

          <p className="muted small" style={{ marginTop: ".6rem" }}>
            {aiRes.model && <>Model: {aiRes.model} · </>}
            {aiRes.rules_searched} rules searched
          </p>
        </div>
      )}
    </div>
  );
}

function RuleEntry({ title, children }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: ".6rem 0" }}>
      <strong>{title}</strong>
      <div className="small" style={{ whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

function examples(ex) {
  if (!ex?.length) return null;
  return <div className="muted small" style={{ marginTop: ".3rem" }}>{ex.map((e, i) => <div key={i}>Example: {e}</div>)}</div>;
}
function seeRules(refs) {
  if (!refs?.length) return null;
  return <div className="muted small" style={{ marginTop: ".3rem" }}>See also: {refs.join(", ")}</div>;
}
