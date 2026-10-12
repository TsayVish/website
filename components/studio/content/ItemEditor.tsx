"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { aiWrite, saveScript, usageNote } from "@/lib/ai/client";
import type { CaptionResult, ScriptResult } from "@/lib/ai/tasks";
import { CONTENT_COLUMNS, FORMAT_LABEL, STATUSES, STATUS_ONE, toLocalInput, type Character, type ContentItem } from "@/lib/content-items";
import { PLATFORM_INFO, PLATFORMS, type Platform } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/client";

type Media = { id: string; kind: string; label: string | null; path: string; url?: string };

/** The side panel for one content item: details, AI writing, media, script, and publishing. */
export function ItemEditor({ item, defaults, characters, aiReady, onClose, onSaved, onError }: {
  item: ContentItem | null; defaults: Partial<ContentItem>; characters: Character[]; aiReady: boolean;
  onClose: () => void; onSaved: (i: ContentItem, removed?: boolean) => void; onError: (msg: string) => void;
}) {
  const start = { ...defaults, ...(item ?? {}) } as Partial<ContentItem>;
  const [projectId, setProjectId] = useState(start.project_id ?? characters.find((c) => c.canEdit)?.id ?? "");
  const [title, setTitle] = useState(start.title ?? "");
  const [format, setFormat] = useState(start.format ?? "post");
  const [status, setStatus] = useState(start.status ?? "idea");
  const [platforms, setPlatforms] = useState<Platform[]>(start.platforms ?? []);
  const [when, setWhen] = useState(toLocalInput(start.planned_at));
  const [body, setBody] = useState(start.body ?? "");
  const [caption, setCaption] = useState(start.caption ?? "");
  const [mediaId, setMediaId] = useState<string | null>(start.media_id ?? null);
  const [scriptId, setScriptId] = useState<string | null>(start.script_id ?? null);
  const [media, setMedia] = useState<Media[] | null>(null);
  const [scripts, setScripts] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [suggest, setSuggest] = useState<CaptionResult | null>(null);
  const [dirty, setDirty] = useState(!item);
  const box = useRef<HTMLDivElement>(null);
  const character = characters.find((c) => c.id === projectId);
  const canEdit = character?.canEdit ?? false;
  const linked = Boolean(item?.social_post_id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    box.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // This character's library and scripts.
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    const db = createClient();
    (async () => {
      const [{ data: m }, { data: s }] = await Promise.all([
        db.from("studio_media").select("id, kind, label, path").eq("project_id", projectId).in("kind", ["image", "video"]).order("created_at", { ascending: false }).limit(60),
        db.from("studio_scripts").select("id, title").eq("project_id", projectId).order("updated_at", { ascending: false }),
      ]);
      const rows = (m ?? []) as Media[];
      const { data: signed } = rows.length ? await db.storage.from("studio-media").createSignedUrls(rows.map((r) => r.path), 3600) : { data: [] };
      const urls = new Map(((signed ?? []) as { path: string | null; signedUrl: string | null }[]).map((x) => [x.path, x.signedUrl ?? undefined]));
      if (!live) return;
      setMedia(rows.map((r) => ({ ...r, url: urls.get(r.path) })));
      setScripts((s ?? []) as { id: string; title: string }[]);
    })();
    return () => { live = false; };
  }, [projectId]);

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); setNote(""); };

  async function save(extra: Partial<ContentItem> = {}) {
    if (!canEdit) return null;
    setBusy("save"); setError("");
    const row = {
      title: title.trim().slice(0, 200), body: body.slice(0, 20000), caption: caption.slice(0, 5000), format, status, platforms,
      planned_at: when ? new Date(when).toISOString() : null, media_id: mediaId, script_id: scriptId, ...extra,
    };
    const db = createClient();
    const { data, error: err } = item
      ? await db.from("content_items").update(row).eq("id", item.id).select(CONTENT_COLUMNS).single()
      : await db.from("content_items").insert({ ...row, project_id: projectId, position: Date.now() / 1000 }).select(CONTENT_COLUMNS).single();
    setBusy("");
    if (err) { setError(err.message); return null; }
    setDirty(false);
    setNote("Saved.");
    onSaved(data as ContentItem);
    return data as ContentItem;
  }

  async function remove() {
    if (!item || !window.confirm("Delete this item? Anything already posted stays on the platforms.")) return;
    const { error: err } = await createClient().from("content_items").delete().eq("id", item.id);
    if (err) return setError(err.message);
    onSaved(item, true);
    onClose();
  }

  async function ai<T>(what: string, run: () => Promise<{ result: T; usage: Parameters<typeof usageNote>[0] }>, use: (r: T) => void | Promise<void>) {
    setBusy(what); setError(""); setNote("");
    try { const r = await run(); await use(r.result); setNote(usageNote(r.usage)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  }
  const brief = [title, body].filter((x) => x.trim()).join("\n\n") || caption;

  const panel = (
    <div className="as-viewer-back cm-back" onClick={() => { if (!dirty || window.confirm("Close without saving?")) onClose(); }}>
      <div className="cm-editor" role="dialog" aria-modal="true" aria-label={item ? "Edit content" : "New content"} tabIndex={-1} ref={box} onClick={(e) => e.stopPropagation()}>
        <div className="cm-ed-head">
          <input className="cm-title" value={title} maxLength={200} placeholder="Working title" disabled={!canEdit} onChange={(e) => touch(setTitle)(e.target.value)} aria-label="Title" />
          <button type="button" className="as-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cm-ed-body">
          <div className="cm-row">
            <label className="so-field"><span className="lbl">Character</span>
              <select className="st-input" value={projectId} disabled={!!item} onChange={(e) => { touch(setProjectId)(e.target.value); setMediaId(null); setScriptId(null); }}>
                {characters.filter((c) => c.canEdit || c.id === projectId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="so-field"><span className="lbl">Status</span>
              <select className="st-input" value={status} disabled={!canEdit || linked} onChange={(e) => touch(setStatus)(e.target.value as ContentItem["status"])}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_ONE[s]}</option>)}
              </select></label>
            <label className="so-field"><span className="lbl">Format</span>
              <select className="st-input" value={format} disabled={!canEdit} onChange={(e) => touch(setFormat)(e.target.value)}>
                {Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          <div className="cm-row">
            <label className="so-field"><span className="lbl">Planned for</span>
              <input className="st-input" type="datetime-local" value={when} disabled={!canEdit || linked} onChange={(e) => touch(setWhen)(e.target.value)} /></label>
            <fieldset className="cm-plats">
              <legend className="lbl">Platforms</legend>
              {PLATFORMS.map((p) => (
                <label key={p} className={`cm-plat so-${p}${platforms.includes(p) ? " on" : ""}`}>
                  <input type="checkbox" checked={platforms.includes(p)} disabled={!canEdit}
                    onChange={(e) => touch(setPlatforms)(e.target.checked ? [...platforms, p] : platforms.filter((x) => x !== p))} />
                  {PLATFORM_INFO[p].label}
                </label>
              ))}
            </fieldset>
          </div>
          {linked && <p className="ai-hint">This item is linked to a Social post, so its status and time follow the post. Move it on the calendar to reschedule.</p>}

          <label className="so-field"><span className="lbl">Notes and outline</span>
            <textarea className="st-input" rows={4} value={body} disabled={!canEdit} onChange={(e) => touch(setBody)(e.target.value)} placeholder="The idea, the hook, shot notes…" /></label>

          <div className="so-field">
            <span className="lbl">Caption <small className="so-count">{caption.length}</small></span>
            <textarea className="st-input" rows={5} value={caption} disabled={!canEdit} onChange={(e) => touch(setCaption)(e.target.value)} placeholder="What goes out with the post." />
            {canEdit && (
              <div className="cm-ai-row">
                <button type="button" className="btn ghost st-small" disabled={!aiReady || !!busy || !brief.trim()}
                  onClick={() => ai<CaptionResult>("caption", () => aiWrite("caption", projectId, { brief, platforms, current: caption }), setSuggest)}>
                  {busy === "caption" ? "Writing…" : "✦ Write captions"}
                </button>
                {(["Punchier", "Shorter", "Funnier"] as const).map((how) => (
                  <button key={how} type="button" className="btn ghost st-small" disabled={!aiReady || !!busy || !caption.trim()}
                    onClick={() => ai<{ text: string }>(how, () => aiWrite("rewrite", projectId, { text: caption, instruction: `make it ${how.toLowerCase()}` }), (r) => touch(setCaption)(r.text))}>
                    {busy === how ? "…" : how}
                  </button>
                ))}
              </div>
            )}
            {suggest && (
              <div className="cm-suggest">
                {Object.entries(suggest.captions).map(([p, text]) => (
                  <div key={p} className="cm-sug">
                    <b>{PLATFORM_INFO[p as Platform]?.label ?? p}</b>
                    <p>{text}</p>
                    <button type="button" className="btn st-small" onClick={() => { touch(setCaption)(text!); }}>Use this</button>
                  </div>
                ))}
                {suggest.hashtags.length > 0 && (
                  <div className="cm-sug">
                    <b>Hashtags</b>
                    <p>{suggest.hashtags.join(" ")}</p>
                    <button type="button" className="btn ghost st-small" onClick={() => touch(setCaption)(`${caption.trim()}\n\n${suggest.hashtags.join(" ")}`.trim())}>Add to caption</button>
                  </div>
                )}
                <button type="button" className="linklike" onClick={() => setSuggest(null)}>Hide suggestions</button>
              </div>
            )}
          </div>

          <div className="so-field">
            <span className="lbl">Media <Link href={`/studio/p/${projectId}/ai`} className="cm-link">Open AI Studio</Link></span>
            {media === null ? <p className="ai-hint">Loading the library…</p> : media.length === 0 ? <p className="ai-hint">Nothing in this character’s library yet. Make or upload pictures and videos in the AI Studio.</p> : (
              <ul className="so-media cm-media">
                {media.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="so-media-tile" aria-selected={m.id === mediaId} disabled={!canEdit} title={m.label ?? ""}
                      onClick={() => touch(setMediaId)(m.id === mediaId ? null : m.id)}>
                      {!m.url ? <span className="as-shimmer" /> : m.kind === "image"
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={m.url} alt="" loading="lazy" /> : <video src={m.url + "#t=0.1"} muted playsInline preload="metadata" />}
                      {m.kind === "video" && <span className="as-play" aria-hidden="true">▶</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="so-field">
            <span className="lbl">Script</span>
            <div className="cm-ai-row">
              <select className="st-input cm-script" value={scriptId ?? ""} disabled={!canEdit} onChange={(e) => touch(setScriptId)(e.target.value || null)}>
                <option value="">No script</option>
                {scripts.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              {canEdit && (
                <button type="button" className="btn ghost st-small" disabled={!aiReady || !!busy || !brief.trim()}
                  onClick={() => ai<ScriptResult>("script", () => aiWrite("script", projectId, { premise: brief, scenes: 4 }), async (r) => {
                    const s = await saveScript(projectId, r);
                    setScripts((list) => [{ id: s.id, title: s.title }, ...list]);
                    touch(setScriptId)(s.id);
                  })}>
                  {busy === "script" ? "Writing…" : "✦ Write script"}
                </button>
              )}
              {scriptId && <Link className="cm-link" href={`/studio/p/${projectId}/ai`}>Edit in Episodes</Link>}
            </div>
          </div>
          {!aiReady && canEdit && <p className="cm-note">✦ tools need an AI key. <Link href="/studio/settings/ai">Add one in Settings → AI</Link>.</p>}
        </div>

        <div className="cm-ed-foot">
          {error && <p className="form-error" role="alert">{error}</p>}
          {!error && note && <p className="form-ok" role="status">{note}</p>}
          <div className="cm-ed-actions">
            {item && canEdit && <button type="button" className="linklike ai-danger" onClick={remove}>Delete</button>}
            <span className="cm-gap" />
            {item?.social_post_id ? (
              <Link className="btn ghost st-small" href={`/studio/p/${projectId}/social`}>View on Social</Link>
            ) : canEdit && mediaId && (
              <button type="button" className="btn ghost st-small" disabled={!!busy}
                onClick={async () => { const saved = dirty || !item ? await save() : item; if (saved) window.location.href = `/studio/p/${projectId}/social?content=${saved.id}`; else onError("Save first."); }}>
                Schedule on Social →
              </button>
            )}
            {canEdit && <button type="button" className="btn st-small" disabled={!!busy || !projectId} onClick={() => save()}>{busy === "save" ? "Saving…" : "Save"}</button>}
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(panel, document.querySelector(".st") ?? document.body);
}
