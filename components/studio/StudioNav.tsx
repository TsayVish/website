"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NotificationBadge } from "./NotificationBadge";
import { isSettingsPath } from "./settings/SettingsNav";
import { UnreadBadge } from "./UnreadBadge";
import { IconBell, IconChat, IconCompass, IconDashboard, IconGear, IconGrid, IconHandshake, IconSearch, IconSpark, IconStore } from "./icons";

type NavLink = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean; badge?: "messages" | "notes" };

const MAIN: NavLink[] = [
  { href: "/studio/hub", label: "Creator hub", icon: <IconDashboard />, match: (p) => (p.startsWith("/studio/hub") || p.startsWith("/studio/posts/")) },
  { href: "/studio", label: "Discover", icon: <IconCompass />, match: (p) => p === "/studio" || p.startsWith("/studio/u/") },
  { href: "/studio/search", label: "Search", icon: <IconSearch />, match: (p) => p.startsWith("/studio/search") },
  { href: "/studio/messages", label: "Messages", icon: <IconChat />, match: (p) => p.startsWith("/studio/messages"), badge: "messages" },
  { href: "/studio/notifications", label: "Notifications", icon: <IconBell />, match: (p) => p.startsWith("/studio/notifications"), badge: "notes" },
  { href: "/studio/projects", label: "Projects", icon: <IconGrid />, match: (p) => p.startsWith("/studio/projects") || p.startsWith("/studio/p/") },
  { href: "/studio/marketplace", label: "Marketplace", icon: <IconStore />, match: (p) => p.startsWith("/studio/marketplace") || p.startsWith("/studio/deals") },
];

const CREATE: NavLink[] = [
  { href: "/studio/new/original", label: "New character", icon: <IconSpark />, match: (p) => p.startsWith("/studio/new/original") },
  { href: "/studio/new/partner", label: "Partner with tsayvish", icon: <IconHandshake />, match: (p) => p.startsWith("/studio/new/partner") },
];

export function StudioNav({ me, unread, notes = 0 }: { me: string; unread: number; notes?: number }) {
  const path = usePathname() ?? "";
  const item = (l: NavLink) => (
    <Link key={l.href} href={l.href} aria-current={l.match(path) ? "page" : undefined}>
      {l.icon}
      <span className="st-nav-text">{l.label}</span>
      {l.badge === "messages" && <UnreadBadge initial={unread} me={me} />}
      {l.badge === "notes" && <NotificationBadge initial={notes} me={me} />}
    </Link>
  );
  return (
    <nav className="st-nav" aria-label="Studio">
      <span className="st-nav-label">Explore</span>
      {MAIN.map(item)}
      <span className="st-nav-label">Create</span>
      {CREATE.map(item)}
    </nav>
  );
}

/** Settings for the bottom of the sidebar: account, credits, orgs and admin all live there. */
export function SettingsLink() {
  const path = usePathname() ?? "";
  return (
    <nav className="st-nav st-nav-bottom" aria-label="Account">
      <Link href="/studio/settings" aria-current={isSettingsPath(path) ? "page" : undefined}>
        <IconGear />
        Settings
      </Link>
    </nav>
  );
}
