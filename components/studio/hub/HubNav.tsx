"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/studio/hub", label: "Dashboard", exact: true },
  { href: "/studio/hub/characters", label: "Characters" },
  { href: "/studio/hub/team", label: "Team" },
  { href: "/studio/hub/library", label: "Library" },
  { href: "/studio/hub/audience", label: "Audience" },
  { href: "/studio/hub/insights", label: "Insights" },
  { href: "/studio/hub/payouts", label: "Payouts" },
  { href: "/studio/hub/moderation", label: "Moderation" },
  { href: "/studio/hub/promotions", label: "Promotions" },
];

export function HubNav() {
  const path = usePathname() ?? "";
  return (
    <nav className="hub-nav" aria-label="Creator hub">
      <span className="hub-nav-title">Creator hub</span>
      {ITEMS.map((i) => {
        const current = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={current ? "page" : undefined}>{i.label}</Link>
        );
      })}
    </nav>
  );
}

/** Tabs across the top of a hub page (Posts / Drafts, Followers / Blocked …). */
export function HubTabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav className="hub-tabs" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={current === t.key ? "page" : undefined}>
          {t.label}
          {typeof t.count === "number" && <span className="st-count">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
