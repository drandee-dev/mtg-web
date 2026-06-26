import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";

const KEY_STORE = "mtgweb:anthropicKey";

export default function AccountDropdown({ session, supabaseEnabled, cloud, onClose, notify }) {
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState(localStorage.getItem(KEY_STORE) || "");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  /* close on outside click */
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

  const avatarLetter = session ? session.user.email[0].toUpperCase() : "?";
  const avatarBg = session ? "var(--accent)" : "var(--bg-raised)";
  const avatarColor = session ? "#1a1206" : "var(--text-muted)";

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 54,
        right: 16,
        zIndex: 200,
        width: 280,
        background: "var(--panel)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,.65)",
        overflow: "hidden",
        animation: "fadeSlideIn .15s ease-out",
      }}
    >
      {/* ── 1. Account status ── */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: avatarBg,
              color: avatarColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            {avatarLetter}
          </div>
          <div style={{ minWidth: 0 }}>
            {supabaseEnabled && session && (
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.user.email}
              </div>
            )}
            {supabaseEnabled && !session && (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Not signed in</div>
            )}
            {!supabaseEnabled && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Local mode &middot; decks saved to this browser
              </div>
            )}
          </div>
        </div>

        {supabaseEnabled && !session && (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "7px 10px",
                fontSize: 13,
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "inherit",
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            <button
              onClick={sendLink}
              disabled={busy}
              style={{
                width: "100%",
                padding: "8px 0",
                fontSize: 13,
                background: "var(--accent)",
                color: "#1a1206",
                border: "none",
                borderRadius: 7,
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? "Sending..." : "Sign in with magic link"}
            </button>
          </>
        )}

        {supabaseEnabled && session && (
          <button
            onClick={signOut}
            style={{
              width: "100%",
              padding: "7px 0",
              fontSize: 13,
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 7,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        )}
      </div>

      {/* ── 2. Cloud sync ── */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Cloud sync</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 9,
              background: cloud ? "var(--accent)" : "var(--bg-raised)",
              color: cloud ? "#1a1206" : "var(--text-muted)",
            }}
          >
            {cloud ? "On" : "Off"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          {cloud
            ? "Decks sync across your devices automatically."
            : "Sign in to sync decks across devices."}
        </div>
      </div>

      {/* ── 3. API key ── */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Anthropic API key</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
          Paste your own key to bypass the daily Planeswalker limit. Stored only in this browser.
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={saveKey}
          placeholder="sk-ant-api03-…"
          style={{
            width: "100%",
            padding: "7px 10px",
            fontSize: 13,
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "inherit",
            fontFamily: "ui-monospace, monospace",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* ── 4. Feedback ── */}
      <div style={{ padding: "4px 8px 8px" }}>
        <button
          onClick={() => {
            window.open("mailto:ANDRES.J.MARTINEZ@outlook.com?subject=MTG%20Workshop%20Feedback", "_blank");
          }}
          style={{
            width: "100%",
            padding: "8px 0",
            fontSize: 13,
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            borderRadius: 6,
          }}
        >
          💬 Send feedback / report a bug
        </button>
      </div>
    </div>
  );
}
