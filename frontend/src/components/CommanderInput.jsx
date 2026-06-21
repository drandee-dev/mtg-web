import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export default function CommanderInput({ commander, setCommander }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const debounce = useRef();

  useEffect(() => {
    clearTimeout(debounce.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      try {
        const r = await api.commanders(query.trim());
        setResults(r.results || []);
      } catch { /* transient */ }
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
    </div>
  );
}
