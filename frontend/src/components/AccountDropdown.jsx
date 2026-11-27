import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useEscapeKey, useFocusTrap } from "../lib/hooks";
import ThemeSwitcher from "./ThemeSwitcher";

const REMEMBER_EMAIL_KEY = "mtgweb:rememberedEmail";
const REMEMBER_ME_KEY = "mtgweb:rememberMe";

// Shared by every address field. type and inputMode bring up the @ keyboard,
// autoCapitalize stops an address arriving with a capital first letter, and
// autoComplete is what makes iOS offer a saved login — "username" when a
// password sits beside it, plain "email" when one doesn't.
const EMAIL_FIELD = {
  type: "email",
  name: "email",
  inputMode: "email",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  placeholder: "your@email.com",
  className: "account-email-input",
};

export default function AccountDropdown({ session, supabaseEnabled, deckCount = 0, onClose, notify }) {
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBER_ME_KEY) !== "false");
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup" | "magic" | "forgot"
  const [busy, setBusy] = useState(false);
  // A problem with the form stays beside it until it is fixed (audit job 6.4).
  // It used to be a toast that left after 3.5 s. `field` is "email", "password"
  // or "form" (the server's answer, which is about both).
  const [error, setError] = useState(null);
  // If the panel was closed while the request was out, there is no form left to
  // show it beside: it goes to the toast, as every problem used to.
  const gone = useRef(false);
  const fail = (field, text) => (gone.current ? notify(text) : setError({ field, text }));
  const errorLine = error && <p id="account-error" className="account-error" role="alert">{error.text}</p>;
  const tied = (field) => (error && (error.field === field || error.field === "form")
    ? { "aria-invalid": true, "aria-describedby": "account-error" } : {});
  function switchMode(mode) { setAuthMode(mode); setError(null); }
  // A dialog: focus moves in, Tab stays in, Escape closes, focus returns to the opener.
  const ref = useFocusTrap(true);
  useEscapeKey(true, onClose);
  // The menu row that opened this panel is gone with its menu, so the trap has
  // nothing to give focus back to. Hand it to the menu's own button, the next
  // logical place, instead of dropping it to the top of the page.
  useEffect(() => () => {
    gone.current = true;
    requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      [...document.querySelectorAll('[aria-label="Account menu"]')].find((b) => b.offsetParent !== null)?.focus();
    });
  }, []);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose]);

  function saveRememberMe(emailValue) {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, emailValue);
      localStorage.setItem(REMEMBER_ME_KEY, "true");
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
      localStorage.setItem(REMEMBER_ME_KEY, "false");
    }
  }

  async function handlePasswordAuth(e) {
    e?.preventDefault();
    if (!email.trim()) return fail("email", "Enter your email.");
    if (!password) return fail("password", "Enter your password.");
    setError(null);
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
      fail("form", `${authMode === "signup" ? "Sign-up" : "Sign-in"} failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendLink(e) {
    e?.preventDefault();
    if (!email.trim()) return fail("email", "Enter your email.");
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/?auth_callback=1` },
      });
      if (error) throw error;
      notify("Check your email for the sign-in link.");
    } catch (e) {
      fail("email", `Sign-in failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset(e) {
    e?.preventDefault();
    if (!email.trim()) return fail("email", "Enter your email first.");
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      notify("Password reset link sent. Check your email.");
    } catch (e) {
      fail("email", `Reset failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    notify("Signed out.");
  }

  const signedIn = supabaseEnabled && session;
  const avatarLetter = session ? session.user.email[0].toUpperCase() : "?";

  return (
    <div className="account-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="account-panel" role="dialog" aria-modal="true"
        aria-label={supabaseEnabled && session ? "Account" : "Sign in"} tabIndex={-1}>
        {/* Header */}
        <div className="account-header-row">
          {signedIn ? (
            <>
              <div className="account-avatar account-avatar-active">{avatarLetter}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="account-email" title={session.user.email}>{session.user.email}</div>
                <div className="account-synced-dot">● Synced</div>
              </div>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flex: "none" }}><path d="M8 1.5L9.5 6H14L10.5 9L12 13.5L8 11L4 13.5L5.5 9L2 6H6.5L8 1.5Z" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              <span className="account-brand-name">MTG Workshop</span>
            </>
          )}
          <button className="account-close" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4L4 12"/></svg>
          </button>
        </div>

        <div className="account-body">
          {/* Cloud sync callout */}
          {signedIn ? (
            <div className="account-callout account-callout-good">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--good)" strokeWidth="1.4" strokeLinecap="round" style={{ flex: "none" }}><path d="M4 11.5a3.5 3.5 0 1 1 .5-6.97A4 4 0 1 1 11.5 9H5"/><path d="M5 11.5l-2 2 2 2"/></svg>
              <div style={{ flex: 1 }}>
                <span className="account-callout-title account-callout-title-good">Cloud sync active</span>
                <span className="account-callout-sub"> {deckCount} deck{deckCount !== 1 ? "s" : ""} · Last synced just now</span>
              </div>
            </div>
          ) : supabaseEnabled ? (
            <div className="account-callout account-callout-blue">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent-2)" strokeWidth="1.4" strokeLinecap="round" style={{ flex: "none", marginTop: "1px" }}><path d="M4 11.5a3.5 3.5 0 1 1 .5-6.97A4 4 0 1 1 11.5 9H5"/><path d="M5 11.5l-2 2 2 2"/></svg>
              <div>
                <div className="account-callout-title account-callout-title-blue">Sign in to enable cloud sync</div>
                <div className="account-callout-text">Your decks are saved in this browser. Sign in, then copy them to your account from Decks to open them on any device.</div>
              </div>
            </div>
          ) : (
            <div className="account-callout account-callout-blue">
              <div className="account-callout-text">Local mode · decks are saved to this browser.</div>
            </div>
          )}

          {/* Sign in (signed-out only) */}
          {supabaseEnabled && !session && (
            <div>
              {authMode === "magic" ? (
                <form onSubmit={sendLink}>
                  <div className="account-section-title">Magic Link</div>
                  <input
                    {...EMAIL_FIELD}
                    autoComplete="email"
                    enterKeyHint="send"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    aria-label="Email"
                    {...tied("email")}
                  />
                  {errorLine}
                  <button type="submit" disabled={busy} className="account-magic-link-btn">
                    {busy ? "Sending…" : "Send magic link"}
                  </button>
                  <div className="account-magic-hint">We'll email you a one-tap sign-in link</div>
                  <button type="button" className="account-auth-toggle" onClick={() => switchMode("signin")}>
                    ← Back to password sign-in
                  </button>
                </form>
              ) : authMode === "forgot" ? (
                <form onSubmit={sendPasswordReset}>
                  <div className="account-section-title">Reset Password</div>
                  <input
                    {...EMAIL_FIELD}
                    autoComplete="email"
                    enterKeyHint="send"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    aria-label="Email"
                    {...tied("email")}
                  />
                  {errorLine}
                  <button type="submit" disabled={busy} className="account-magic-link-btn">
                    {busy ? "Sending…" : "Send reset link"}
                  </button>
                  <div className="account-magic-hint">We'll email you a link to set a new password</div>
                  <button type="button" className="account-auth-toggle" onClick={() => switchMode("signin")}>
                    ← Back to sign-in
                  </button>
                </form>
              ) : (
                <form onSubmit={handlePasswordAuth}>
                  <div className="account-auth-tabs">
                    <button
                      type="button"
                      aria-pressed={authMode === "signin"}
                      className={`account-auth-tab ${authMode === "signin" ? "active" : ""}`}
                      onClick={() => switchMode("signin")}
                    >Sign In</button>
                    <button
                      type="button"
                      aria-pressed={authMode === "signup"}
                      className={`account-auth-tab ${authMode === "signup" ? "active" : ""}`}
                      onClick={() => switchMode("signup")}
                    >Create Account</button>
                  </div>
                  <input
                    {...EMAIL_FIELD}
                    autoComplete="username"
                    enterKeyHint="next"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    aria-label="Email"
                    {...tied("email")}
                  />
                  <input
                    type="password"
                    name="password"
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    enterKeyHint="go"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    aria-label={authMode === "signup" ? "Choose a password" : "Password"}
                    {...tied("password")}
                    placeholder={authMode === "signup" ? "Choose a password" : "Password"}
                    className="account-email-input"
                  />
                  {authMode === "signin" && (
                    <label className="account-remember-me">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <span>Remember me</span>
                    </label>
                  )}
                  {errorLine}
                  <button type="submit" disabled={busy} className="account-magic-link-btn">
                    {busy ? "Working…" : authMode === "signup" ? "Create Account" : "Sign In"}
                  </button>
                  <div className="account-auth-links">
                    {authMode === "signin" && (
                      <button type="button" className="account-auth-toggle" onClick={() => switchMode("forgot")}>
                        Forgot password?
                      </button>
                    )}
                    <button type="button" className="account-auth-toggle" onClick={() => switchMode("magic")}>
                      Use magic link instead
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Theme */}
          <div>
            <div className="account-section-title">Theme</div>
            <ThemeSwitcher />
          </div>

          {/* Footer: only Sign Out lives here, so it shows only when signed in. */}
          {signedIn && (
            <div className="account-footer">
              <button onClick={signOut} className="account-signout-btn">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3h3.5A1.5 1.5 0 0 1 15 4.5v7A1.5 1.5 0 0 1 13.5 13H10M7 10l3-2-3-2M1 8h10"/></svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
