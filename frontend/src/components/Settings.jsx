import { useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";

const KEY_STORE = "mtgweb:anthropicKey";

// Account (magic-link sign in/out) + optional personal Anthropic API key (Phase 2).
export default function Settings({ session, notify }) {
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState(localStorage.getItem(KEY_STORE) || "");
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
            Cloud accounts aren’t configured for this site. Decks save to this device; use
            Export/Import to move them. (The owner can enable sync by adding Supabase keys.)
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
            <p className="muted small">Enter your email — we’ll send a one-tap sign-in link. Same account works on phone and desktop.</p>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
            <div className="row" style={{ marginTop: ".5rem" }}>
              <button className="primary" onClick={sendLink} disabled={busy}>Send magic link</button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>AI features (optional)</h2>
        <p className="muted small">
          Paste your own Anthropic API key to power AI deck suggestions with your own account.
          It’s stored only in this browser and never saved on the server. Leave blank to use the
          site owner’s key (if enabled). Note: a Claude subscription can’t be used here — only an API key.
        </p>
        <label>Anthropic API key</label>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="sk-ant-…" />
        <div className="row" style={{ marginTop: ".5rem" }}>
          <button className="primary" onClick={saveKey}>Save</button>
        </div>
      </div>
    </div>
  );
}
