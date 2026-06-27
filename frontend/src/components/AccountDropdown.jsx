import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";
import ThemeSwitcher from "./ThemeSwitcher";

const KEY_STORE = "mtgweb:anthropicKey";

export default function AccountDropdown({ session, supabaseEnabled, deckCount = 0, onClose, notify }) {
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState(localStorage.getItem(KEY_STORE) || "");
  const [editingKey, setEditingKey] = useState(!localStorage.getItem(KEY_STORE));
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose]);

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

  function saveKey() {
    if (apiKey.trim()) {
      localStorage.setItem(KEY_STORE, apiKey.trim());
      setEditingKey(false);
    } else {
      localStorage.removeItem(KEY_STORE);
    }
    notify("Saved.");
  }

  const signedIn = supabaseEnabled && session;
  const avatarLetter = session ? session.user.email[0].toUpperCase() : "?";
  const maskedKey = apiKey ? `sk-ant-${"•".repeat(20)}` : "";

  return (
    <div className="account-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="account-panel">
        {/* Header */}
        <div className="account-header-row">
          {signedIn ? (
            <>
              <div className="account-avatar account-avatar-active">{avatarLetter}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="account-email">{session.user.email}</div>
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
                <div className="account-callout-text">Your decks are saved locally. Sign in to back them up and access from any device.</div>
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
              <div className="account-section-title">Sign In</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="account-email-input"
              />
              <button onClick={sendLink} disabled={busy} className="account-magic-link-btn">
                {busy ? "Sending..." : "Send magic link"}
              </button>
              <div className="account-magic-hint">No password required · Check your email</div>
            </div>
          )}

          {/* Theme */}
          <div>
            <div className="account-section-title">Theme</div>
            <ThemeSwitcher />
          </div>

          {/* API key */}
          <div>
            <div className="account-key-header">
              <span className="account-section-title" style={{ margin: 0 }}>Anthropic API Key</span>
              {apiKey && !editingKey && <span className="account-key-badge">Active</span>}
            </div>
            {apiKey && !editingKey ? (
              <div className="account-key-display">
                <span className="account-key-masked">{maskedKey}</span>
                <button className="account-key-change" onClick={() => setEditingKey(true)}>Change</button>
              </div>
            ) : (
              <>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={saveKey}
                  placeholder="sk-ant-... (optional, for AI features)"
                  className="account-api-input"
                />
                <div className="account-callout-text" style={{ marginTop: "6px" }}>
                  Enables AI analysis and the Planeswalker assistant. Your key is stored locally and never sent to our servers.
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="account-footer">
            <button
              className="account-feedback-link"
              onClick={() => window.open("mailto:ANDRES.J.MARTINEZ@outlook.com?subject=MTG%20Workshop%20Feedback", "_blank")}
            >
              Send feedback ↗
            </button>
            {signedIn && (
              <button onClick={signOut} className="account-signout-btn">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3h3.5A1.5 1.5 0 0 1 15 4.5v7A1.5 1.5 0 0 1 13.5 13H10M7 10l3-2-3-2M1 8h10"/></svg>
                Sign Out
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
