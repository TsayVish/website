import Link from "next/link";

/** "Show more" at the bottom of a long list. Uses a link, so it works without JavaScript and keeps the scroll position. */
export function MoreLink({ href, label = "Show more" }: { href: string; label?: string }) {
  return (
    <div className="st-more">
      <Link href={href} scroll={false} className="btn ghost st-small">{label}</Link>
    </div>
  );
}
