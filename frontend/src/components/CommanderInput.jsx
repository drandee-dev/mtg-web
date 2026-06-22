import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export default function CommanderInput({ commander, setCommander }) {
  const cmds = (commander || "").split(" && ").filter(Boolean);
  const cmd1 = cmds[0] || "";
  const cmd2 = cmds[1] || "";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [partnerKind, setPartnerKind] = useState(null);
  const [pickingPartner, setPickingPartner] = useState(false);
  const debounce = useRef();
  const seq = useRef(0);

  useEffect(() => {
    clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setError(""); setLoading(false); return; }
    setLoading(true);
    const myseq = ++seq.current;
    debounce.current = setTimeout(async () => {
      try {
        const r = await api.commanders(q, pickingPartner ? cmd1 : undefined);
        if (myseq !== seq.current) return;
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
  }, [query, pickingPartner, cmd1]);

  function pickFirst(name, result) {
    setCommander(name);
    setQuery("");
    setResults([]);
    setPartnerKind(result?.partner_kind || null);
    setPickingPartner(false);
  }

  function pickPartner(name) {
    setCommander(`${cmd1} && ${name}`);
    setQuery("");
    setResults([]);
    setPickingPartner(false);
  }

  function clearAll() {
    setCommander("");
    setQuery("");
    setPartnerKind(null);
    setPickingPartner(false);
  }

  function clearPartner() {
    setCommander(cmd1);
    setQuery("");
    setPickingPartner(false);
  }

  // Both commanders set
  if (cmd1 && cmd2) {
    return (
      <div style={{ margin: ".4rem 0" }}>
        <label style={{ margin: 0 }}>Commanders</label>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginTop: ".2rem" }}>
          <strong>{cmd1}</strong> + <strong>{cmd2}</strong>
          <button className="ghost small" onClick={clearPartner}>remove partner</button>
          <button className="ghost small" onClick={clearAll}>change</button>
        </div>
      </div>
    );
  }

  // First commander set, not searching for partner
  if (cmd1 && !pickingPartner) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", margin: ".4rem 0" }}>
        <label style={{ margin: 0 }}>Commander:</label>
        <strong>{cmd1}</strong>
        <button className="ghost small" onClick={clearAll}>change</button>
        {partnerKind && (
          <button className="ghost small" onClick={() => { setPickingPartner(true); setQuery(""); }}>
            + partner
          </button>
        )}
      </div>
    );
  }

  // Search mode: first commander or partner
  return (
    <div style={{ position: "relative", margin: ".4rem 0" }}>
      {pickingPartner && (
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".3rem" }}>
          <label style={{ margin: 0 }}>Commander:</label>
          <strong>{cmd1}</strong>
          <button className="ghost small" onClick={clearAll}>change</button>
        </div>
      )}
      <label htmlFor="cmd-input">{pickingPartner ? "Partner" : "Commander"}</label>
      <div style={{ display: "flex", gap: ".3rem" }}>
        <input
          id="cmd-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={pickingPartner ? `Search partner for ${cmd1}…` : "Start typing… e.g. nethroi"}
          autoComplete="off"
          style={{ flex: 1 }}
        />
        {pickingPartner && (
          <button className="ghost small" onClick={() => setPickingPartner(false)}>Cancel</button>
        )}
      </div>
      {results.length > 0 && (
        <div className="autocomplete">
          {results.map((c) => (
            <button key={c.name} className="ac-item"
              onClick={() => pickingPartner ? pickPartner(c.name) : pickFirst(c.name, c)}>
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
