import { useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";

const KEY_STORE = "mtgweb:anthropicKey";

export default function Settings({ session, notify }) {
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState(localStorage.getItem(KEY_STORE) || "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendLink() {
    if (!email.trim()) return notify("Enter your email.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      notify("Check your email for the sign-in link.");
    } catch (e) {
      notify(`Sign-in failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    notify("Signed out.");
  }

  function saveKey() {
    if (apiKey.trim()) localStorage.setItem(KEY_STORE, apiKey.trim());
    else localStorage.removeItem(KEY_STORE);
    notify("Saved.");
  }

  return (
    <div>
      <div className="panel">
        <h2>Account</h2>
        {!supabaseEnabled && (
          <p className="muted small">
            Cloud accounts aren't configured for this site. Decks save to this device; use
            Export/Import to move them.
          </p>
        )}
        {supabaseEnabled && session && (
          <div className="spread">
            <span>Signed in as <strong>{session.user.email}</strong></span>
            <button onClick={signOut}>Sign out</button>
          </div>
        )}
        {supabaseEnabled && !session && (
          <>
            <p className="muted small">Enter your email — we'll send a one-tap sign-in link. Same account works on phone and desktop.</p>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
            <div className="row" style={{ marginTop: ".5rem" }}>
              <button className="primary" onClick={sendLink} disabled={busy}>Send magic link</button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>AI features</h2>
        <p className="muted small">
          AI-powered features (suggested cuts, composition fills, rules Q&A, combo guidance) are
          included — no setup needed. Usage is limited to {25} calls per day.
        </p>
        <p className="muted small" style={{ marginTop: ".3rem" }}>
          <button className="ghost small" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? "Hide advanced" : "Use your own API key (advanced)"}
          </button>
        </p>
        {showAdvanced && (
          <div style={{ marginTop: ".5rem" }}>
            <p className="muted small">
              Paste your own Anthropic API key to bypass the daily limit and use your own account.
              Stored only in this browser, never sent to the server for storage.
            </p>
            <label>Anthropic API key</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="sk-ant-…" />
            <div className="row" style={{ marginTop: ".5rem" }}>
              <button className="primary" onClick={saveKey}>Save</button>
              {apiKey && <button onClick={() => { setApiKey(""); localStorage.removeItem(KEY_STORE); notify("Key removed."); }}>Clear</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
