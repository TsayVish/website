"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tabs across the top of every Settings page: Account, Credits, Orgs and (for staff) Admin. */
export function SettingsNav({ staff, inOrg, credits }: { staff: boolean; inOrg: boolean; credits: string | null }) {
  const path = usePathname() ?? "";
  const items = [
    { href: "/studio/settings", label: "Account" },
    { href: "/studio/credits", label: "Credits", extra: credits },
    ...(staff || inOrg ? [{ href: "/studio/orgs", label: "Orgs" }] : []),
    ...(staff ? [{ href: "/studio/admin", label: "Admin" }] : []),
  ];
  return (
    <nav className="hub-nav set-nav" aria-label="Settings">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path.startsWith(i.href) ? "page" : undefined}>
          {i.label}
          {i.extra && <span className="set-nav-extra">{i.extra}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Pages that belong to Settings, so the sidebar can highlight it. */
export const isSettingsPath = (p: string) => ["/studio/settings", "/studio/credits", "/studio/orgs", "/studio/admin"].some((x) => p.startsWith(x));
