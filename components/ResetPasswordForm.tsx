"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import s from "./auth.module.css";

// Reached from the password-reset email (via /auth/callback, which logs the person in first).
export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const password = String(d.get("password") ?? "");
    const confirm = String(d.get("confirm") ?? "");
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don’t match.");
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) return setError(friendlyAuthError(err.message));
      router.push("/studio");
      router.refresh();
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.panel}>
      <div className={s.head}>
        <h2>Choose a new password</h2>
        <p className={s.sub}>You’ll go straight to your Studio afterwards.</p>
      </div>
      <form className={s.form} onSubmit={onSubmit} noValidate>
        <div className={s.f}>
          <label htmlFor="rp-pass">New password</label>
          <input id="rp-pass" name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" />
        </div>
        <div className={s.f}>
          <label htmlFor="rp-confirm">Repeat new password</label>
          <input id="rp-confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        {error && <p className={s.err} role="alert">{error}</p>}
        <button className={s.submit} type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      </form>
      <p className={s.switch} style={{ marginTop: 20 }}>
        Link not working? <Link className={s.linkBtn} href="/login?mode=login">Request a new one</Link>
      </p>
    </section>
  );
}
