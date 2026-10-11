"use client";

import { useEffect, useState } from "react";
import { applyTheme, effectiveTheme, readTheme, type ThemeChoice } from "@/lib/theme";

/** Keeps every toggle on the page in sync with the saved choice. */
function useThemeChoice() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const saved = readTheme();
    // Backup for the boot script in the root layout: make sure a saved choice is applied.
    if (saved !== "system" && document.documentElement.getAttribute("data-theme") !== saved) {
      document.documentElement.setAttribute("data-theme", saved);
    }
    setChoice(saved);
    setMounted(true);
    const onChange = (e: Event) => setChoice((e as CustomEvent<ThemeChoice>).detail);
    window.addEventListener("tsayvish-theme", onChange);
    return () => window.removeEventListener("tsayvish-theme", onChange);
  }, []);
  return { choice, mounted, set: (c: ThemeChoice) => { applyTheme(c); setChoice(c); } };
}

const Sun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);

/** Small sun/moon button that flips between light and dark. */
export function ThemeButton({ className = "theme-btn" }: { className?: string }) {
  const { choice, mounted, set } = useThemeChoice();
  const isDark = mounted && effectiveTheme(choice) === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" className={className} onClick={() => set(isDark ? "light" : "dark")} aria-label={label} title={label}>
      {isDark ? <Sun /> : <Moon />}
    </button>
  );
}

/** System / Light / Dark choice for the Settings page. */
export function ThemeSwitch() {
  const { choice, set } = useThemeChoice();
  const options: { value: ThemeChoice; label: string }[] = [
    { value: "system", label: "Match my device" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <div className="chips" role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" className="chip" aria-checked={choice === o.value} aria-pressed={choice === o.value} onClick={() => set(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
