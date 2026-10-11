"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A horizontal tab bar for a section of the Studio (same look as the Creator hub tabs). */
export function SectionNav({ label, items }: { label: string; items: { href: string; label: string; exact?: boolean; badge?: number }[] }) {
  const path = usePathname() ?? "";
  return (
    <nav className="hub-nav" aria-label={label}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={(i.exact ? path === i.href : path.startsWith(i.href)) ? "page" : undefined}>
          {i.label}
          {i.badge ? <span className="st-count adm-count">{i.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
