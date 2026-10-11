"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Critter } from "./art";
import { LogoMark } from "./Logo";
import s from "./auth.module.css";

type Mode = "signup" | "login";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// TODO: connect these forms to your auth provider (for example Clerk, Supabase Auth or Auth.js).
// Until then, a valid submission shows a "not connected yet" note instead of creating an account.
const NOT_CONNECTED = {
  signup: "Sign-up isn’t connected yet. This page is a design preview, so no account was created.",
  login: "Log-in isn’t connected yet. This page is a design preview.",
  reset: "Password reset isn’t connected yet. This page is a design preview.",
};

export function AuthPanel({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  function switchTo(next: Mode) {
    setMode(next);
    setError("");
    setNote("");
    window.history.replaceState(null, "", `/login?mode=${next}`);
  }

  function onSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const name = String(d.get("name") ?? "").trim();
    const email = String(d.get("email") ?? "").trim();
    const password = String(d.get("password") ?? "");
    let msg = "";
    if (!name) msg = "Enter your name.";
    else if (!isEmail(email)) msg = "Enter a valid email address.";
    else if (password.length < 8) msg = "Use a password with at least 8 characters.";
    else if (!d.get("terms")) msg = "Agree to the terms to continue.";
    setError(msg);
    setNote(msg ? "" : NOT_CONNECTED.signup);
  }

  function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const email = String(d.get("email") ?? "").trim();
    const password = String(d.get("password") ?? "");
    let msg = "";
    if (!isEmail(email)) msg = "Enter a valid email address.";
    else if (!password) msg = "Enter your password.";
    setError(msg);
    setNote(msg ? "" : NOT_CONNECTED.login);
  }

  return (
    <div className={s.split}>
      <aside className={s.side}>
        <Link className={s.logo} href="/">
          <LogoMark />
          tsayvish
        </Link>
        <div>
          <h1>Every franchise starts with one character.</h1>
          <p>Build yours, protect it, open a shop and take payments, all from one account. Or partner with the tsayvish cast.</p>
        </div>
        <div className={s.crew} aria-hidden="true">
          <Critter name="Pudding" species="Frog" body="var(--mint)" ears="frog" />
          <Critter name="Bramble" species="Bear" body="var(--butter)" ears="round" />
          <Critter name="Sorrel" species="Cat" body="var(--lilac)" ears="pointy" />
        </div>
      </aside>

      <main className={s.main}>
        <div className={s.box}>
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
              <form className={s.form} onSubmit={onSignup} noValidate>
                <div className={s.f}>
                  <label htmlFor="su-name">Name</label>
                  <input id="su-name" name="name" autoComplete="name" required />
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
                  <legend>What brings you to tsayvish?</legend>
                  <label className={s.opt} htmlFor="goal-build">
                    <input type="radio" name="goal" id="goal-build" value="build" defaultChecked />
                    <span><b>Build my own character</b><small>Create and scale a character with our tools</small></span>
                  </label>
                  <label className={s.opt} htmlFor="goal-partner">
                    <input type="radio" name="goal" id="goal-partner" value="partner" />
                    <span><b>Partner on the tsayvish cast</b><small>Brands, licensees and manufacturers</small></span>
                  </label>
                </fieldset>
                <label className={s.check} htmlFor="su-terms">
                  <input type="checkbox" id="su-terms" name="terms" />
                  <span>I agree to the Terms of Service and Privacy Policy.</span>
                </label>
                {error && <p className={s.err} role="alert">{error}</p>}
                <button className={s.submit} type="submit">Create account</button>
                {note && <p className={s.note} role="status">{note}</p>}
              </form>
            </section>
          ) : (
            <section className={s.panel} id="panel-login" role="tabpanel" aria-labelledby="tab-login">
              <div className={s.head}>
                <h2>Welcome back</h2>
                <p className={s.sub}>Your characters missed you.</p>
              </div>
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
                  <label className={s.check} htmlFor="li-remember">
                    <input type="checkbox" id="li-remember" name="remember" defaultChecked />
                    <span>Keep me logged in</span>
                  </label>
                  <button type="button" className={s.linkBtn} onClick={() => { setError(""); setNote(NOT_CONNECTED.reset); }}>
                    Forgot password?
                  </button>
                </div>
                {error && <p className={s.err} role="alert">{error}</p>}
                <button className={s.submit} type="submit">Log in</button>
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
        </div>
      </main>
    </div>
  );
}
