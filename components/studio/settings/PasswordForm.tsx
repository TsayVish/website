"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ kind: "err", text: "Use a password with at least 8 characters." });
    if (pw !== confirm) return setMsg({ kind: "err", text: "The two passwords don’t match." });
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      return setMsg({
        kind: "err",
        text: m.includes("reauth") || m.includes("recent")
          ? "For security, log out and back in, then change your password straight away."
          : friendlyAuthError(error.message),
      });
    }
    setPw("");
    setConfirm("");
    setMsg({ kind: "ok", text: hasPassword ? "Password changed." : "Password set. You can now also log in with your email and this password." });
  }

  return (
    <form className="panel" id="password" onSubmit={onSubmit} noValidate>
      <div className="st-set-head">
        <h2>Password</h2>
        <p className="st-muted">
          {hasPassword ? "Choose a new password for logging in with your email." : "You sign in with Google. Set a password to also log in with your email."}
        </p>
      </div>
      <div className="st-fields">
        <div className="field">
          <label htmlFor="pw-new">{hasPassword ? "New password" : "Password"}</label>
          <input className="st-input" id="pw-new" type="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" value={pw} onChange={(e) => { setPw(e.target.value); setMsg(null); }} />
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">Repeat password</label>
          <input className="st-input" id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setMsg(null); }} />
        </div>
      </div>
      {msg && <p className={msg.kind === "err" ? "form-error" : "form-ok"} role="status">{msg.text}</p>}
      <div className="launch">
        <button className="btn" type="submit" disabled={busy || !pw}>{busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}</button>
      </div>
    </form>
  );
}
