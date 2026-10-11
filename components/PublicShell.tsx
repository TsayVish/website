import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeButton } from "@/components/ThemeToggle";

/** Header and footer for pages anyone can see (Explore, public listings and creators, legal pages). */
export function PublicShell({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
  return (
    <div className="pub">
      <header className="pub-nav">
        <div className="pub-wrap">
          <Logo />
          <nav className="pub-links" aria-label="Main">
            <Link href="/explore">Explore</Link>
            <Link href="/#services">What we handle</Link>
          </nav>
          <div className="pub-right">
            <ThemeButton />
            {signedIn ? (
              <Link className="btn st-small" href="/studio">Open Studio</Link>
            ) : (
              <>
                <Link className="pub-login" href="/login?mode=login">Log in</Link>
                <Link className="btn st-small" href="/login?mode=signup">Join tsayvish</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="pub-main">{children}</main>
      <footer className="pub-foot">
        <div className="pub-wrap">
          <span>© {new Date().getFullYear()} tsayvish</span>
          <nav aria-label="Legal">
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/creator-agreement">Creator agreement</Link>
            <Link href="/legal/dmca">Copyright (DMCA)</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
