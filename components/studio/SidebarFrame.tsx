"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

/**
 * The Studio sidebar. On wide screens it's always open. On phones it collapses to a
 * top bar with a menu button; the menu closes on navigation, outside tap or Escape.
 */
export function SidebarFrame({ logo, children }: { logo: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.classList.add("st-menu-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("st-menu-open");
    };
  }, [open]);

  // Close when a link inside the menu is tapped (even if it's the page you're on).
  function onBodyClick(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <>
      <div className="st-side-top">
        {logo}
        <button
          type="button"
          className="st-burger"
          aria-expanded={open}
          aria-controls="st-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <div id="st-menu" className="st-side-body" data-open={open} onClick={onBodyClick}>
        {children}
      </div>
      {open && <button type="button" className="st-scrim" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />}
    </>
  );
}
