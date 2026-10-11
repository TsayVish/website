"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGear, IconGrid, IconHandshake, IconSpark, IconStore } from "./icons";

const LINKS = [
  { href: "/studio", label: "Projects", icon: <IconGrid />, exact: true },
  { href: "/studio/new/original", label: "New original", icon: <IconSpark /> },
  { href: "/studio/new/partner", label: "Partner with tsayvish", icon: <IconHandshake /> },
  { href: "/studio/marketplace", label: "Marketplace", icon: <IconStore /> },
];

export function StudioNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="st-nav" aria-label="Studio">
      <span className="st-nav-label">Workspace</span>
      {LINKS.map((l) => {
        const current = l.exact ? path === l.href || path.startsWith("/studio/p/") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
            {l.icon}
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Settings link for the bottom of the sidebar. */
export function SettingsLink() {
  const path = usePathname() ?? "";
  return (
    <nav className="st-nav st-nav-bottom" aria-label="Account">
      <Link href="/studio/settings" aria-current={path.startsWith("/studio/settings") ? "page" : undefined}>
        <IconGear />
        Settings
      </Link>
    </nav>
  );
}
