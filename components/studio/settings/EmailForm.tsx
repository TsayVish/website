"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function EmailForm({ current, pending }: { current: string; pending?: string | null }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    pending ? { kind: "ok", text: `Waiting for you to confirm ${pending}. Check both inboxes.` } : null,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = email.trim();
    if (!isEmail(next)) return setMsg({ kind: "err", text: "Enter a valid email address." });
    if (next.toLowerCase() === current.toLowerCase()) return setMsg({ kind: "err", text: "That’s already your email." });
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().auth.updateUser(
      { email: next },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/studio/settings` },
    );
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: friendlyAuthError(error.message) });
    setEmail("");
    setMsg({ kind: "ok", text: `Almost done. We sent confirmation links to ${current} and ${next}. Your email changes once you confirm.` });
  }

  return (
    <form className="panel" id="email" onSubmit={onSubmit} noValidate>
      <div className="st-set-head">
        <h2>Email</h2>
        <p className="st-muted">You sign in with <b>{current}</b>.</p>
      </div>
      <div className="field">
        <label htmlFor="em-new">New email</label>
        <input className="st-input" id="em-new" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setMsg(null); }} />
      </div>
      {msg && <p className={msg.kind === "err" ? "form-error" : "form-ok"} role="status">{msg.text}</p>}
      <div className="launch">
        <button className="btn" type="submit" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Change email"}</button>
      </div>
    </form>
  );
}
