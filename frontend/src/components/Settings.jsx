import { useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";

const REMEMBER_EMAIL_KEY = "mtgweb:rememberedEmail";
const REMEMBER_ME_KEY = "mtgweb:rememberMe";

export default function Settings({ session, notify }) {
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBER_ME_KEY) !== "false");
  const [authMode, setAuthMode] = useState("signin");
  const [busy, setBusy] = useState(false);

  function saveRememberMe(emailValue) {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, emailValue);
      localStorage.setItem(REMEMBER_ME_KEY, "true");
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
      localStorage.setItem(REMEMBER_ME_KEY, "false");
    }
  }

  async function handlePasswordAuth() {
    if (!email.trim()) return notify("Enter your email.");
    if (!password) return notify("Enter your password.");
    setBusy(true);
    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/?auth_callback=1` },
        });
        if (error) throw error;
        saveRememberMe(email.trim());
        notify("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        saveRememberMe(email.trim());
        notify("Signed in!");
      }
    } catch (e) {
      notify(`${authMode === "signup" ? "Sign-up" : "Sign-in"} failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendLink() {
    if (!email.trim()) return notify("Enter your email.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/?auth_callback=1` },
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
            <p className="muted small">
              {authMode === "signup"
                ? "Create an account to sync your decks across devices."
                : "Sign in to sync your decks across devices."}
            </p>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" />
            <label>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
              placeholder={authMode === "signup" ? "Choose a password" : "Password"}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordAuth()} />
            <div className="row" style={{ marginTop: ".5rem", gap: ".5rem" }}>
              <button className="primary" onClick={handlePasswordAuth} disabled={busy}>
                {busy ? "Working..." : authMode === "signup" ? "Create Account" : "Sign In"}
              </button>
            </div>
            <div className="row" style={{ marginTop: ".25rem", gap: ".75rem" }}>
              <button className="ghost small" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>
                {authMode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
              </button>
              <button className="ghost small" onClick={sendLink} disabled={busy}>
                Use magic link
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Planeswalker</h2>
        <p className="muted small">
          The ⚡ Planeswalker provides tailored deck advice, rules answers, and strategy guidance —
          no setup needed. Usage is limited to 50 calls per day.
        </p>
      </div>
    </div>
  );
}
