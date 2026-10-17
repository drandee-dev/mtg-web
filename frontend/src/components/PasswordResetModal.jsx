import { useState } from "react";
import { supabase } from "../lib/supabase";

// Shown after a password-recovery link signs the person in: one field, one
// button. App opens it on the PASSWORD_RECOVERY auth event.
export default function PasswordResetModal({ onDone, notify }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (pw.length < 6) return notify("Password must be at least 6 characters.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      notify("Password updated!");
      onDone();
    } catch (e) {
      notify(`Update failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDone(); }}>
      <div className="account-panel">
        <div className="account-body">
          <div className="account-section-title">Set New Password</div>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="New password (min 6 characters)" className="account-email-input"
            onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
          <button onClick={submit} disabled={busy} className="account-magic-link-btn">
            {busy ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}
