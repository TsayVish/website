import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeButton } from "./ThemeToggle";

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap">
        <Logo />
        <nav className="nav-links" aria-label="Sections">
          <a href="#build">Build a character</a>
          <a href="#cast">Our cast</a>
          <a href="#services">What we handle</a>
          <a href="#engine">How it works</a>
        </nav>
        <div className="nav-right">
          <ThemeButton />
          <Link className="login-link" href="/login?mode=login">Log in</Link>
          <Link className="btn" href="/login?mode=signup">Get started</Link>
        </div>
      </div>
    </header>
  );
}
