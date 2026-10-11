"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

const KEY = "tsayvish-recent-searches";

export function rememberSearch(q: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(KEY) || "[]");
    localStorage.setItem(KEY, JSON.stringify([q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6)));
  } catch {
    /* storage unavailable: fine */
  }
}

export function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The search box: a large rounded composer with a send button, like an AI chat input. */
export function SearchComposer({ defaultValue = "", autoFocus = false, size = "lg", type }: { defaultValue?: string; autoFocus?: boolean; size?: "lg" | "sm"; type?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const input = useRef<HTMLInputElement>(null);

  // Focus on larger screens only, so phones don't jump straight to the keyboard.
  useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 641px)").matches) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return input.current?.focus();
    rememberSearch(q);
    const params = new URLSearchParams({ q });
    if (type && type !== "all") params.set("type", type);
    router.push(`/studio/search?${params}`);
  }

  return (
    <form className={`sx-box sx-${size}`} action="/studio/search" role="search" onSubmit={submit}>
      <svg className="sx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
      </svg>
      <label htmlFor="sx-q" className="visually-hidden">Search tsayvish</label>
      <input
        ref={input} id="sx-q" name="q" type="search" value={value} autoComplete="off" enterKeyHint="search"
        placeholder="Search creators, characters, services and posts"
        onChange={(e) => setValue(e.target.value)}
      />
      {value && (
        <button type="button" className="sx-clear" aria-label="Clear search" onClick={() => { setValue(""); input.current?.focus(); }}>×</button>
      )}
      <button type="submit" className="sx-go" aria-label="Search" disabled={!value.trim()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg>
      </button>
    </form>
  );
}
