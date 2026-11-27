import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useEscapeKey, useFocusTrap } from "../lib/hooks";

// Shown after a password-recovery link signs the person in: one field, one
// button. App opens it on the PASSWORD_RECOVERY auth event. A dialog like the
// others (audit job 6.4): focus moves in and stays in, Escape closes it, and a
// problem with the password stays under the field, not in a passing toast.
export default function PasswordResetModal({ onDone, notify }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useFocusTrap(true);
  useEscapeKey(true, onDone);
  async function submit(e) {
    e.preventDefault();
    if (pw.length < 6) return setError("Password must be at least 6 characters.");
    setError("");
    setBusy(true);
    try {
      const { error: failed } = await supabase.auth.updateUser({ password: pw });
      if (failed) throw failed;
      notify("Password updated!");
      onDone();
    } catch (err) {
      setError(`Update failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-overlay" onClick={(e) => { if (e.target === e.currentTarget) onDone(); }}>
      <div className="account-panel" role="dialog" aria-modal="true" aria-labelledby="password-reset-title" ref={ref} tabIndex={-1}>
        <form className="account-body" onSubmit={submit}>
          <div className="account-section-title" id="password-reset-title">Set New Password</div>
          <input type="password" name="new-password" autoComplete="new-password"
            value={pw} onChange={(e) => { setPw(e.target.value); setError(""); }}
            aria-label="New password" aria-invalid={error ? true : undefined}
            aria-describedby={error ? "password-reset-error" : undefined}
            placeholder="New password (min 6 characters)" className="account-email-input" />
          {error && <p id="password-reset-error" className="account-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy} className="account-magic-link-btn">
            {busy ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
