"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";
import s from "./auth.module.css";

type Mode = "signup" | "login";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function AuthPanel({ initialMode, next, linkError }: { initialMode: Mode; next?: string; linkError?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [error, setError] = useState(linkError ? "That link has expired or was already used. Log in, or request a new one." : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const destination = safeNext(next);

  function switchTo(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setNote("");
    window.history.replaceState(null, "", `/login?mode=${nextMode}`);
  }

  async function onSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const name = String(d.get("name") ?? "").trim();
    const email = String(d.get("email") ?? "").trim();
    const password = String(d.get("password") ?? "");
    const goal = d.get("goal") === "partner" ? "partner" : "build";
    let msg = "";
    if (!name) msg = "Enter your name.";
    else if (!isEmail(email)) msg = "Enter a valid email address.";
    else if (password.length < 8) msg = "Use a password with at least 8 characters.";
    else if (!d.get("terms")) msg = "Agree to the terms to continue.";
    setError(msg);
    setNote("");
    if (msg) return;

    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, goal },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/studio`,
        },
      });
      if (err) return setError(friendlyAuthError(err.message));
      if (data.session) {
        // Email confirmation is off in Supabase: the person is logged in right away.
        router.push("/studio");
        router.refresh();
        return;
      }
      setNote(`Almost there. We sent a confirmation link to ${email}. Open it on this device to finish signing up.`);
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const email = String(d.get("email") ?? "").trim();
    const password = String(d.get("password") ?? "");
    let msg = "";
    if (!isEmail(email)) msg = "Enter a valid email address.";
    else if (!password) msg = "Enter your password.";
    setError(msg);
    setNote("");
    if (msg) return;

    setBusy(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) return setError(friendlyAuthError(err.message));
      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    const input = document.getElementById("li-email") as HTMLInputElement | null;
    const email = input?.value.trim() ?? "";
    setNote("");
    if (!isEmail(email)) {
      setError("Enter your email above first, then click “Forgot password?” again.");
      input?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (err) return setError(friendlyAuthError(err.message));
      setNote(`If there’s an account for ${email}, a link to reset your password is on its way.`);
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError("");
    setNote("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}` },
      });
      // On success the browser leaves for Google, so we only get here on an error.
      if (err) {
        setError(
          err.message.toLowerCase().includes("not enabled")
            ? "Google sign-in isn’t switched on yet. Use email for now."
            : friendlyAuthError(err.message),
        );
        setBusy(false);
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  const googleBlock = (
    <>
      <button type="button" className={s.google} onClick={onGoogle} disabled={busy}>
        Continue with Google
      </button>
      <div className={s.or} aria-hidden="true"><span>or use email</span></div>
    </>
  );

  return (
    <>
      <div className={s.tabs} role="tablist" aria-label="Account">
        <button className={s.tab} role="tab" id="tab-signup" aria-controls="panel-signup" aria-selected={mode === "signup"} onClick={() => switchTo("signup")}>
          Sign up
        </button>
        <button className={s.tab} role="tab" id="tab-login" aria-controls="panel-login" aria-selected={mode === "login"} onClick={() => switchTo("login")}>
          Log in
        </button>
      </div>

      {mode === "signup" ? (
        <section className={s.panel} id="panel-signup" role="tabpanel" aria-labelledby="tab-signup">
          <div className={s.head}>
            <h2>Create your account</h2>
            <p className={s.sub}>Start building in a few minutes.</p>
          </div>
          {googleBlock}
          <form className={s.form} onSubmit={onSignup} noValidate>
            <div className={s.f}>
              <label htmlFor="su-name">Name</label>
              <input id="su-name" name="name" autoComplete="name" maxLength={80} required />
            </div>
            <div className={s.f}>
              <label htmlFor="su-email">Email</label>
              <input id="su-email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className={s.f}>
              <label htmlFor="su-pass">Password</label>
              <input id="su-pass" name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" />
            </div>
            <fieldset className={s.fieldset}>
              <legend>What are you here to do first?</legend>
              <label className={s.opt} htmlFor="goal-build">
                <input type="radio" name="goal" id="goal-build" value="build" defaultChecked />
                <span><b>Create an original</b><small>Build and scale a character of your own</small></span>
              </label>
              <label className={s.opt} htmlFor="goal-partner">
                <input type="radio" name="goal" id="goal-partner" value="partner" />
                <span><b>Partner with tsayvish</b><small>Brands, licensees and manufacturers</small></span>
              </label>
              <small className={s.hint}>You can do both later. This just sets where you start.</small>
            </fieldset>
            <label className={s.check} htmlFor="su-terms">
              <input type="checkbox" id="su-terms" name="terms" />
              <span>I agree to the Terms of Service and Privacy Policy.</span>
            </label>
            {error && <p className={s.err} role="alert">{error}</p>}
            <button className={s.submit} type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
            {note && <p className={s.note} role="status">{note}</p>}
          </form>
        </section>
      ) : (
        <section className={s.panel} id="panel-login" role="tabpanel" aria-labelledby="tab-login">
          <div className={s.head}>
            <h2>Welcome back</h2>
            <p className={s.sub}>Your characters missed you.</p>
          </div>
          {googleBlock}
          <form className={s.form} onSubmit={onLogin} noValidate>
            <div className={s.f}>
              <label htmlFor="li-email">Email</label>
              <input id="li-email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className={s.f}>
              <label htmlFor="li-pass">Password</label>
              <input id="li-pass" name="password" type="password" autoComplete="current-password" required />
            </div>
            <div className={s.row}>
              <span />
              <button type="button" className={s.linkBtn} onClick={onForgot} disabled={busy}>
                Forgot password?
              </button>
            </div>
            {error && <p className={s.err} role="alert">{error}</p>}
            <button className={s.submit} type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
            {note && <p className={s.note} role="status">{note}</p>}
          </form>
        </section>
      )}

      <p className={s.switch}>
        {mode === "signup" ? (
          <>Already have an account? <button type="button" className={s.linkBtn} onClick={() => switchTo("login")}>Log in</button></>
        ) : (
          <>New to tsayvish? <button type="button" className={s.linkBtn} onClick={() => switchTo("signup")}>Create an account</button></>
        )}
      </p>
      <Link className={s.back} href="/">← Back to tsayvish</Link>
    </>
  );
}
