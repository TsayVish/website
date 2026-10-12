"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FORMAT_LABEL, STATUS_LABEL, STATUS_ONE, dayKey, type CalendarPost, type Character, type ContentItem, type ContentStatus } from "@/lib/content-items";
import { createClient } from "@/lib/supabase/client";
import { AIPlanner } from "./AIPlanner";
import { ItemEditor } from "./ItemEditor";
import { Marks } from "./Marks";

const LANES: ContentStatus[] = ["idea", "draft", "ready", "scheduled", "posted"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ContentManager({ characters, items: initialItems, posts: initialPosts, aiReady, initialCharacter, initialView }: {
  characters: Character[]; items: ContentItem[]; posts: CalendarPost[]; aiReady: boolean;
  initialCharacter: string; initialView: "board" | "calendar";
}) {
  const [items, setItems] = useState(initialItems);
  const [posts, setPosts] = useState(initialPosts);
  const [character, setCharacter] = useState(initialCharacter);
  const [view, setView] = useState(initialView);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ContentItem | "new" | null>(null);
  const [newDefaults, setNewDefaults] = useState<Partial<ContentItem>>({});
  const [planner, setPlanner] = useState<"ideas" | "plan" | null>(null);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<string | null>(null);
  const [month, setMonth] = useState<Date | null>(null);
  useEffect(() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }, []);

  // Remember the view and character in the address, so links and reloads come back here.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (character === "all") u.searchParams.delete("c"); else u.searchParams.set("c", character);
    if (view === "board") u.searchParams.delete("view"); else u.searchParams.set("view", view);
    window.history.replaceState(null, "", u.toString());
  }, [character, view]);

  const byId = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const editable = characters.filter((c) => c.canEdit);
  const words = q.trim().toLowerCase();
  const shown = items.filter((i) => (character === "all" || i.project_id === character)
    && (!words || `${i.title} ${i.caption} ${i.body}`.toLowerCase().includes(words)));
  const shownPosts = posts.filter((p) => character === "all" || p.project_id === character);
  const canEdit = (i: { project_id: string }) => byId.get(i.project_id)?.canEdit ?? false;

  async function patch(id: string, change: Partial<ContentItem>) {
    const before = items.find((i) => i.id === id);
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));
    setError("");
    const { error: err } = await createClient().from("content_items").update(change).eq("id", id);
    if (err) {
      setError(err.message);
      if (before) setItems((list) => list.map((i) => (i.id === id ? before : i)));
      return false;
    }
    return true;
  }

  function saved(item: ContentItem, removed = false) {
    setItems((list) => (removed ? list.filter((i) => i.id !== item.id) : list.some((i) => i.id === item.id) ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item]));
    if (!removed) setEditing(item);
  }

  function openNew(defaults: Partial<ContentItem> = {}) {
    if (!editable.length) return;
    setNewDefaults({ project_id: character !== "all" && byId.get(character)?.canEdit ? character : editable[0].id, ...defaults });
    setEditing("new");
  }

  // ── Board drag and drop ──
  function onDrop(e: DragEvent, lane: ContentStatus) {
    e.preventDefault();
    setOverLane(null);
    const id = dragId || e.dataTransfer.getData("text/plain");
    setDragId(null);
    const it = items.find((i) => i.id === id);
    if (!it || it.status === lane || !canEdit(it)) return;
    const top = Math.max(0, ...items.filter((i) => i.status === lane).map((i) => i.position)) + 1;
    patch(id, { status: lane, position: top });
  }

  // ── Calendar ──
  async function moveToDay(id: string, day: Date) {
    const it = items.find((i) => i.id === id);
    if (!it || !canEdit(it)) return;
    const old = it.planned_at ? new Date(it.planned_at) : null;
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old?.getHours() ?? 12, old?.getMinutes() ?? 0);
    if (it.social_post_id && it.status === "scheduled") {
      if (when.getTime() < Date.now() + 60_000) return setError("Scheduled posts can only move to a future time.");
      const res = await fetch(`/api/social/posts/${it.social_post_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledAt: when.toISOString() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error || "Couldn’t move that post.");
      setPosts((list) => list.map((p) => (p.id === it.social_post_id ? { ...p, scheduled_at: when.toISOString() } : p)));
      setItems((list) => list.map((i) => (i.id === id ? { ...i, planned_at: when.toISOString() } : i)));
      return;
    }
    patch(id, { planned_at: when.toISOString() });
  }

  const weeks = useMemo(() => {
    if (!month) return [];
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)));
  }, [month]);
  const onDay = (d: Date) => {
    const k = dayKey(d);
    const its = shown.filter((i) => i.status !== "archived" && i.planned_at && dayKey(new Date(i.planned_at)) === k)
      .sort((a, b) => a.planned_at!.localeCompare(b.planned_at!));
    const linked = new Set(items.map((i) => i.social_post_id).filter(Boolean));
    const ps = shownPosts.filter((p) => !linked.has(p.id) && p.status !== "canceled" && dayKey(new Date(p.scheduled_at)) === k);
    return { its, ps };
  };
  const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const unscheduled = shown.filter((i) => !i.planned_at && !["posted", "archived"].includes(i.status));

  const card = (i: ContentItem) => {
    const c = byId.get(i.project_id);
    return (
      <li key={i.id}>
        <button type="button" className={`cm-card s-${i.status}`} draggable={canEdit(i)} onClick={() => setEditing(i)}
          onDragStart={(e) => { setDragId(i.id); e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => setDragId(null)} data-dragging={dragId === i.id || undefined}>
          <b>{i.title || i.caption.slice(0, 60) || "Untitled"}</b>
          {i.caption && i.title && <span className="cm-card-cap">{i.caption}</span>}
          <span className="cm-card-meta">
            {character === "all" && c && <span className="cm-who">{c.name}</span>}
            <span>{FORMAT_LABEL[i.format] ?? i.format}</span>
            {i.planned_at && <span suppressHydrationWarning>{new Date(i.planned_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
            {i.media_id && <span title="Has media" aria-label="Has media">▣</span>}
            {i.script_id && <span title="Has a script" aria-label="Has a script">✎</span>}
            <Marks platforms={i.platforms} />
          </span>
        </button>
      </li>
    );
  };

  if (!characters.length) {
    return (
      <div className="st-empty">
        <b>No characters yet</b>
        <p>Create a character first, then plan and write its content here.</p>
        <Link className="btn st-small" href="/studio/new/original">New character</Link>
      </div>
    );
  }

  return (
    <div className="cm">
      <div className="cm-bar">
        <label className="as-pill">
          <span className="visually-hidden">Character</span>
          <select value={character} onChange={(e) => setCharacter(e.target.value)}>
            <option value="all">All characters</option>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <nav className="as-seg" aria-label="View">
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button>
          <button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}>Calendar</button>
        </nav>
        <input className="st-input hub-search cm-search" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search content" />
        <span className="cm-gap" />
        {editable.length > 0 && (
          <>
            <button type="button" className="btn ghost st-small" onClick={() => setPlanner("ideas")} title={aiReady ? undefined : "Add an AI key in Settings → AI"}>✦ Ideas</button>
            <button type="button" className="btn ghost st-small" onClick={() => setPlanner("plan")} title={aiReady ? undefined : "Add an AI key in Settings → AI"}>✦ Plan posts</button>
            <button type="button" className="btn st-small" onClick={() => openNew()}>New</button>
          </>
        )}
      </div>
      {!aiReady && editable.length > 0 && (
        <p className="cm-note">The ✦ AI tools need a Claude or OpenAI API key. <Link href="/studio/settings/ai">Add one in Settings → AI</Link>.</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      {view === "board" ? (
        <div className="cm-board">
          {[...LANES, ...(showArchived ? (["archived"] as ContentStatus[]) : [])].map((lane) => {
            const list = shown.filter((i) => i.status === lane).sort((a, b) => b.position - a.position || b.updated_at.localeCompare(a.updated_at));
            return (
              <section key={lane} className={`cm-lane l-${lane}`} aria-label={STATUS_LABEL[lane]} data-over={overLane === lane || undefined}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverLane(lane); } }} onDragLeave={() => setOverLane(null)} onDrop={(e) => onDrop(e, lane)}>
                <header><h2>{STATUS_LABEL[lane]}</h2><span className="st-count">{list.length}</span>
                  {lane === "idea" && editable.length > 0 && <button type="button" className="cm-add" onClick={() => openNew({ status: "idea" })} aria-label="Add an idea">+</button>}
                </header>
                <ul>{list.map(card)}</ul>
                {!list.length && <p className="cm-empty">{lane === "idea" ? "Jot ideas here, or brainstorm with ✦ Ideas." : lane === "scheduled" ? "Items scheduled on Social land here." : "Drag cards here."}</p>}
              </section>
            );
          })}
          <button type="button" className="linklike cm-archived" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? "Hide archived" : `Show archived (${shown.filter((i) => i.status === "archived").length})`}
          </button>
        </div>
      ) : (
        <div className="cm-cal-wrap">
          <div className="cm-cal">
            <div className="cm-cal-head">
              <button type="button" className="btn ghost st-small" onClick={() => month && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
              <b>{month?.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
              <button type="button" className="btn ghost st-small" onClick={() => month && setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
              <button type="button" className="btn ghost st-small" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
            </div>
            <div className="cm-grid" role="grid">
              {WEEKDAYS.map((w) => <div key={w} className="cm-wd" role="columnheader">{w}</div>)}
              {weeks.flat().map((d) => {
                const { its, ps } = onDay(d);
                const other = month && d.getMonth() !== month.getMonth();
                const today = dayKey(d) === dayKey(new Date());
                return (
                  <div key={dayKey(d)} role="gridcell" className={`cm-day${other ? " other" : ""}${today ? " today" : ""}`} data-over={overLane === dayKey(d) || undefined}
                    onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverLane(dayKey(d)); } }} onDragLeave={() => setOverLane(null)}
                    onDrop={(e) => { e.preventDefault(); setOverLane(null); const id = dragId || e.dataTransfer.getData("text/plain"); setDragId(null); if (id) moveToDay(id, d); }}>
                    <div className="cm-day-top">
                      <span>{d.getDate()}</span>
                      {editable.length > 0 && <button type="button" className="cm-add" aria-label={`Add on ${d.toDateString()}`}
                        onClick={() => openNew({ status: "draft", planned_at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString() })}>+</button>}
                    </div>
                    {its.map((i) => (
                      <button key={i.id} type="button" className={`cm-chip s-${i.status}`} draggable={canEdit(i)} onClick={() => setEditing(i)}
                        onDragStart={(e) => { setDragId(i.id); e.dataTransfer.setData("text/plain", i.id); }} onDragEnd={() => setDragId(null)}
                        title={`${byId.get(i.project_id)?.name ?? ""} · ${STATUS_ONE[i.status]}`}>
                        <small>{time(i.planned_at!)}</small> {i.title || i.caption || "Untitled"}
                      </button>
                    ))}
                    {ps.map((p) => (
                      <Link key={p.id} href={`/studio/p/${p.project_id}/social`} className={`cm-chip post s-${p.status === "posted" ? "posted" : "scheduled"}`}
                        title={`Social post · ${byId.get(p.project_id)?.name ?? ""}`}>
                        <small>{time(p.scheduled_at)}</small> {p.title || p.caption || "Post"}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <aside className="cm-unsched" aria-label="Not on the calendar yet">
            <h2>Not scheduled</h2>
            {unscheduled.length === 0 ? <p className="cm-empty">Everything has a date.</p> : (
              <ul>{unscheduled.map((i) => (
                <li key={i.id}>
                  <button type="button" className={`cm-chip s-${i.status}`} draggable={canEdit(i)} onClick={() => setEditing(i)}
                    onDragStart={(e) => { setDragId(i.id); e.dataTransfer.setData("text/plain", i.id); }} onDragEnd={() => setDragId(null)}>
                    {i.title || i.caption || "Untitled"}
                  </button>
                </li>
              ))}</ul>
            )}
            <p className="ai-hint">Drag onto a day to plan it. Moving a scheduled item also moves its Social post.</p>
          </aside>
        </div>
      )}

      {editing && (
        <ItemEditor
          item={editing === "new" ? null : editing}
          defaults={newDefaults}
          characters={characters}
          aiReady={aiReady}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onError={setError}
        />
      )}
      {planner && (
        <AIPlanner
          mode={planner}
          characters={editable}
          initialCharacter={character !== "all" && byId.get(character)?.canEdit ? character : editable[0]?.id}
          onClose={() => setPlanner(null)}
          onAdded={(rows) => { setItems((list) => [...list, ...rows]); if (planner === "plan") setView("calendar"); setPlanner(null); }}
        />
      )}
    </div>
  );
}
