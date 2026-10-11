import Link from "next/link";
import { Critter } from "./art";
import { LogoMark } from "./Logo";
import s from "./auth.module.css";

/** Split-screen frame shared by the sign-up / log-in and reset-password pages. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.split}>
      <aside className={s.side}>
        <Link className={s.logo} href="/">
          <LogoMark />
          tsayvish
        </Link>
        <div>
          <h1>Every franchise starts with one character.</h1>
          <p>Create originals, partner with the tsayvish cast, and run every project from one account.</p>
        </div>
        <div className={s.crew} aria-hidden="true">
          <Critter name="Pudding" species="Frog" body="var(--mint)" ears="frog" />
          <Critter name="Bramble" species="Bear" body="var(--butter)" ears="round" />
          <Critter name="Sorrel" species="Cat" body="var(--lilac)" ears="pointy" />
        </div>
      </aside>
      <main className={s.main}>
        <div className={s.box}>{children}</div>
      </main>
    </div>
  );
}
