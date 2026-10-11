import Link from "next/link";

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <span>© {new Date().getFullYear()} tsayvish. Original character IP.</span>
        <nav className="foot-links" aria-label="Legal">
          <Link href="/explore">Explore</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/creator-agreement">Creator agreement</Link>
          <Link href="/legal/dmca">DMCA</Link>
        </nav>
        <span>Made by Vish &amp; Alexa</span>
      </div>
    </footer>
  );
}
