"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { aiWrite, usageNote, type AIUsage } from "@/lib/ai/client";
import type { Idea, PlanItem } from "@/lib/ai/tasks";
import { CONTENT_COLUMNS, FORMAT_LABEL, type Character, type ContentItem } from "@/lib/content-items";
import { PLATFORM_INFO, PLATFORMS, type Platform } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/client";
import { Marks } from "./Marks";

const tomorrow = () => { const d = new Date(Date.now() + 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** ✦ Ideas (brainstorm onto the board) and ✦ Plan posts (fill the calendar with dated drafts). */
export function AIPlanner({ mode, characters, initialCharacter, onClose, onAdded }: {
  mode: "ideas" | "plan"; characters: Character[]; initialCharacter?: string;
  onClose: () => void; onAdded: (rows: ContentItem[]) => void;
}) {
  const [projectId, setProjectId] = useState(initialCharacter ?? characters[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<Platform[]>(["instagram", "tiktok"]);
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState(6);
  const [start, setStart] = useState(tomorrow());
  const [days, setDays] = useState(7);
  const [perWeek, setPerWeek] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<(Idea | PlanItem)[] | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [usage, setUsage] = useState<AIUsage | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function generate() {
    setBusy(true); setError(""); setResults(null);
    try {
      if (mode === "ideas") {
        const r = await aiWrite<{ ideas: Idea[] }>("ideas", projectId, { count, theme, platforms });
        setResults(r.result.ideas); setKeep(r.result.ideas.map(() => true)); setUsage(r.usage);
      } else {
        const r = await aiWrite<{ items: PlanItem[] }>("plan", projectId, {
          start, days, perWeek, theme, platforms, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        setResults(r.result.items); setKeep(r.result.items.map(() => true)); setUsage(r.usage);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  async function add() {
    if (!results) return;
    const chosen = results.filter((_, i) => keep[i]);
    if (!chosen.length) return;
    setBusy(true); setError("");
    const base = Date.now() / 1000;
    const rows = chosen.map((r, i) => {
      const plan = "date" in r ? r : null;
      return {
        project_id: projectId, title: r.title, body: r.hook, caption: r.caption, format: r.format,
        platforms: r.platforms.length ? r.platforms : platforms, status: plan ? "draft" : "idea",
        planned_at: plan ? new Date(`${plan.date}T${plan.time}`).toISOString() : null, position: base + i,
      };
    });
    const { data, error: err } = await createClient().from("content_items").insert(rows).select(CONTENT_COLUMNS);
    setBusy(false);
    if (err) return setError(err.message);
    onAdded((data ?? []) as ContentItem[]);
  }

  const n = keep.filter(Boolean).length;
  const dialog = (
    <div className="as-viewer-back cm-back" onClick={onClose}>
      <div className="cm-editor cm-planner" role="dialog" aria-modal="true" aria-label={mode === "ideas" ? "Brainstorm ideas" : "Plan posts"} onClick={(e) => e.stopPropagation()}>
        <div className="cm-ed-head">
          <h2 className="cm-title">{mode === "ideas" ? "✦ Brainstorm ideas" : "✦ Plan posts"}</h2>
          <button type="button" className="as-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="cm-ed-body">
          <div className="cm-row">
            <label className="so-field"><span className="lbl">Character</span>
              <select className="st-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            {mode === "ideas" ? (
              <label className="so-field"><span className="lbl">How many</span>
                <select className="st-input" value={count} onChange={(e) => setCount(+e.target.value)}>{[3, 6, 9, 12].map((x) => <option key={x} value={x}>{x} ideas</option>)}</select></label>
            ) : (
              <>
                <label className="so-field"><span className="lbl">Starting</span>
                  <input className="st-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
                <label className="so-field"><span className="lbl">For</span>
                  <select className="st-input" value={days} onChange={(e) => setDays(+e.target.value)}>
                    <option value={7}>1 week</option><option value={14}>2 weeks</option><option value={30}>30 days</option></select></label>
                <label className="so-field"><span className="lbl">Posts a week</span>
                  <select className="st-input" value={perWeek} onChange={(e) => setPerWeek(+e.target.value)}>{[2, 3, 5, 7, 10, 14].map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
              </>
            )}
          </div>
          <fieldset className="cm-plats">
            <legend className="lbl">Platforms</legend>
            {PLATFORMS.map((p) => (
              <label key={p} className={`cm-plat so-${p}${platforms.includes(p) ? " on" : ""}`}>
                <input type="checkbox" checked={platforms.includes(p)} onChange={(e) => setPlatforms(e.target.checked ? [...platforms, p] : platforms.filter((x) => x !== p))} />
                {PLATFORM_INFO[p].label}
              </label>
            ))}
          </fieldset>
          <label className="so-field"><span className="lbl">Theme or focus <small className="so-count">optional</small></span>
            <input className="st-input" value={theme} maxLength={300} onChange={(e) => setTheme(e.target.value)}
              placeholder={mode === "ideas" ? "Back-to-school week, a new running bit…" : "Launch of the plush, Halloween…"} /></label>
          <div className="cm-ai-row">
            <button type="button" className="btn st-small" disabled={busy || !projectId || !platforms.length} onClick={generate}>
              {busy && !results ? "Thinking…" : results ? "Try again" : mode === "ideas" ? "Brainstorm" : "Make a plan"}
            </button>
            {usage && <small className="ai-hint">{usageNote(usage)}</small>}
          </div>
          {error && (
            <p className="form-error" role="alert">{error}{/Settings → AI|credits/.test(error) && <> <Link href="/studio/settings/ai">Settings → AI</Link></>}</p>
          )}
          {results && (
            <ul className="cm-results">
              {results.map((r, i) => (
                <li key={i} className={keep[i] ? "on" : ""}>
                  <label>
                    <input type="checkbox" checked={keep[i]} onChange={(e) => setKeep((k) => k.map((x, j) => (j === i ? e.target.checked : x)))} />
                    <span>
                      <b>{r.title}</b>
                      <small>
                        {"date" in r && <>{new Date(`${r.date}T${r.time}`).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · </>}
                        {FORMAT_LABEL[r.format] ?? r.format} <Marks platforms={r.platforms} />
                      </small>
                      {r.hook && <em>{r.hook}</em>}
                      {r.caption && <span className="cm-res-cap">{r.caption}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cm-ed-foot">
          <div className="cm-ed-actions">
            <span className="cm-gap" />
            <button type="button" className="btn ghost st-small" onClick={onClose}>Cancel</button>
            <button type="button" className="btn st-small" disabled={!results || !n || busy} onClick={add}>
              {mode === "ideas" ? `Add ${n} to Ideas` : `Add ${n} to the calendar`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(dialog, document.querySelector(".st") ?? document.body);
}
