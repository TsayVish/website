export type ThemeChoice = "system" | "light" | "dark";

const KEY = "tsayvish-theme";

/** Light mode unless the person picked something else. */
export const DEFAULT_THEME: ThemeChoice = "light";

/**
 * Runs before the page paints (inlined in the root layout). The page is served with
 * data-theme="light"; this switches to a saved "dark", or removes it for "system".
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${KEY}"),r=document.documentElement;if(t==="dark")r.setAttribute("data-theme","dark");else if(t==="system")r.removeAttribute("data-theme");else r.setAttribute("data-theme","light")}catch(e){}`;

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" || t === "system" ? t : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Storage can be blocked (private windows); the choice still applies to this page.
  }
  window.dispatchEvent(new CustomEvent("tsayvish-theme", { detail: choice }));
}

/** The theme actually on screen right now. */
export function effectiveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
