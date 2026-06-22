import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export default function CommanderInput({ commander, setCommander }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");   // inline feedback when the lookup fails
  const [loading, setLoading] = useState(false);
  const debounce = useRef();
  const seq = useRef(0);                     // guard against out-of-order responses

  useEffect(() => {
    clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setError(""); setLoading(false); return; }
    setLoading(true);
    const myseq = ++seq.current;
    debounce.current = setTimeout(async () => {
      try {
        const r = await api.commanders(q);
        if (myseq !== seq.current) return;   // a newer query superseded this one
        setResults(r.results || []);
        setError("");
      } catch (e) {
        if (myseq !== seq.current) return;
        setResults([]);
        setError(e.message === "Failed to fetch" ? "Server waking up — try again in a moment." : "Couldn't load suggestions.");
      } finally {
        if (myseq === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [query]);

  function pick(name) {
    setCommander(name);
    setQuery("");
    setResults([]);
  }

  function clear() {
    setCommander("");
    setQuery("");
  }

  if (commander) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", margin: ".4rem 0" }}>
        <label style={{ margin: 0 }}>Commander:</label>
        <strong>{commander}</strong>
        <button className="ghost small" onClick={clear}>change</button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", margin: ".4rem 0" }}>
      <label htmlFor="cmd-input">Commander</label>
      <input
        id="cmd-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing… e.g. nethroi"
        autoComplete="off"
      />
      {results.length > 0 && (
        <div className="autocomplete">
          {results.map((c) => (
            <button key={c.name} className="ac-item" onClick={() => pick(c.name)}>
              <strong>{c.name}</strong>
              <span className="muted small"> {c.type_line}</span>
            </button>
          ))}
        </div>
      )}
      {error && !loading && results.length === 0 && (
        <p className="muted small" style={{ marginTop: ".2rem" }}>{error}</p>
      )}
    </div>
  );
}
