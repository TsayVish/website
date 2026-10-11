"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { checkMediaFile, extFor, kindOfMime, type MediaKind } from "@/lib/studio/catalog";
import { MEDIA_COLUMNS, clock, type StudioMedia } from "@/lib/studio/types";
import { uploadCharacterImage } from "@/lib/upload";

export type CharacterImage = { key: string; url: string; label: string };

type Filter = "all" | MediaKind;

/** Measures an audio or video file's length in the browser before upload. */
function measure(file: File): Promise<number | null> {
  if (!/^(audio|video)\//.test(file.type)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("video") ? "video" : "audio");
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (v: number | null) => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(v); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

export function MediaLibrary({
  projectId, canEdit, media, characterImages, urls, selected, onSelect, onUploaded, onRemoved, onDuration, onNotice,
}: {
  projectId: string;
  canEdit: boolean;
  media: StudioMedia[];
  characterImages: CharacterImage[];
  urls: Record<string, string>;
  selected: string[];
  onSelect: (keys: string[]) => void;
  onUploaded: (rows: StudioMedia[]) => void;
  onRemoved: (id: string) => void;
  onDuration: (id: string, ms: number) => void;
  onNotice: (text: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState("");

  function play(id: string) {
    document.querySelectorAll<HTMLAudioElement>(".ai-library audio").forEach((a) => { if (a.id !== `ai-a-${id}`) a.pause(); });
    const el = document.getElementById(`ai-a-${id}`) as HTMLAudioElement | null;
    if (!el) return;
    if (el.paused) el.play().catch(() => undefined); else el.pause();
  }

  async function upload(files: File[]) {
    files = files.slice(0, 20);
    if (!files.length) return;
    const bad = files.map((f) => checkMediaFile(f)).find(Boolean);
    if (bad) return setError(bad);
    setError("");
    const supabase = createClient();
    const added: StudioMedia[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const kind = kindOfMime(f.type)!;
        const path = `${projectId}/${crypto.randomUUID()}.${extFor(f.type, kind)}`;
        const duration_ms = await measure(f);
        const { error: upErr } = await supabase.storage.from("studio-media").upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data, error: insErr } = await supabase.from("studio_media")
          .insert({ project_id: projectId, kind, path, mime: f.type, bytes: f.size, duration_ms, label: f.name.replace(/\.[^.]+$/, "").slice(0, 120) })
          .select(MEDIA_COLUMNS).single();
        if (insErr) {
          await supabase.storage.from("studio-media").remove([path]);
          throw new Error(insErr.message);
        }
        added.push(data as StudioMedia);
      }
    } catch (e) {
      setError(`Couldn’t upload: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy("");
    if (added.length) onUploaded(added.reverse());
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    upload(files);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (canEdit) upload([...e.dataTransfer.files]);
  }

  async function remove(m: StudioMedia) {
    if (!window.confirm(`Delete “${m.label || "this file"}” from the library?`)) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("studio_media").delete().eq("id", m.id);
    if (err) return setError(err.message);
    await supabase.storage.from("studio-media").remove([m.path]);
    onRemoved(m.id);
  }

  async function toAssets(m: StudioMedia) {
    const url = urls[m.path];
    if (!url) return;
    setBusy("Adding to Assets…");
    try {
      const blob = await (await fetch(url)).blob();
      const type = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(blob.type) ? blob.type : "image/png";
      const file = new File([blob], `${m.label || "studio-image"}.${extFor(type, "image")}`, { type });
      const publicUrl = await uploadCharacterImage(file);
      const { error: err } = await createClient().from("character_assets").insert({ project_id: projectId, kind: "reference", label: (m.label || "From AI Studio").slice(0, 80), url: publicUrl });
      if (err) throw new Error(err.message);
      onNotice("Added to the character’s Assets.");
    } catch (e) {
      setError(`Couldn’t add it: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy("");
  }

  async function rename(m: StudioMedia, label: string) {
    if (label === (m.label ?? "")) return;
    await createClient().from("studio_media").update({ label: label.slice(0, 120) || null }).eq("id", m.id);
  }

  function saveDuration(m: StudioMedia, el: HTMLMediaElement) {
    if (m.duration_ms || !Number.isFinite(el.duration)) return;
    const ms = Math.round(el.duration * 1000);
    onDuration(m.id, ms);
    if (canEdit) createClient().from("studio_media").update({ duration_ms: ms }).eq("id", m.id).then(() => undefined);
  }

  function toggle(key: string) {
    onSelect(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  const shown = filter === "all" ? media : media.filter((m) => m.kind === filter);
  const count = (k: MediaKind) => media.filter((m) => m.kind === k).length;
  const order = (key: string) => selected.indexOf(key) + 1;

  return (
    <div className="ai-panel ai-library" onDragOver={(e) => { e.preventDefault(); if (canEdit) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} data-dragging={dragging || undefined}>
      <div className="ai-head">
        <h2>Library</h2>
        {canEdit && (
          <>
            <label className="btn st-small" htmlFor="ai-files">{busy || "Upload"}</label>
            <input id="ai-files" className="visually-hidden" type="file" multiple disabled={!!busy}
              accept="image/png,image/jpeg,image/webp,image/gif,audio/*,video/mp4,video/webm,video/quicktime" onChange={onFiles} />
          </>
        )}
      </div>
      {canEdit && <p className="ai-hint">Drop images, audio or video here, up to 50 MB each. Only upload things you own or have permission to use. Tap a file to use it in the generator.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {characterImages.length > 0 && (
        <div className="ai-group">
          <b className="ai-group-title">From the character</b>
          <ul className="ai-tiles">
            {characterImages.map((c) => {
              const n = order(c.key);
              return (
                <li key={c.key} className="ai-tile" data-selected={n > 0 || undefined}>
                  <button type="button" className="ai-tile-pick" onClick={() => toggle(c.key)} aria-pressed={n > 0} aria-label={`Use ${c.label}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt="" loading="lazy" />
                    {n > 0 && <span className="ai-order">{n}</span>}
                  </button>
                  <span className="ai-tile-label">{c.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <nav className="st-tabs ai-filter" aria-label="File type">
        {(["all", "image", "audio", "video"] as Filter[]).map((f) => (
          <button key={f} type="button" aria-current={filter === f ? "page" : undefined} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "image" ? "Images" : f === "audio" ? "Audio" : "Video"}
            <span className="st-count">{f === "all" ? media.length : count(f)}</span>
          </button>
        ))}
      </nav>

      {shown.length === 0 ? (
        <div className="ai-empty">
          <p>{media.length ? "Nothing of this type yet." : "Your uploads and everything you generate land here."}</p>
        </div>
      ) : (
        <ul className="ai-tiles">
          {shown.map((m) => {
            const key = `media:${m.id}`;
            const n = order(key);
            const url = urls[m.path];
            return (
              <li key={m.id} className={`ai-tile ai-${m.kind}`} data-selected={n > 0 || undefined} data-playing={playing === m.id || undefined}>
                <button type="button" className="ai-tile-pick" onClick={() => toggle(key)} aria-pressed={n > 0} aria-label={`Use ${m.label || m.kind}`}>
                  {m.kind === "image" && url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" loading="lazy" />
                  )}
                  {m.kind === "video" && url && (
                    <video src={url + "#t=0.1"} muted playsInline preload="metadata" onLoadedMetadata={(e) => saveDuration(m, e.currentTarget)} />
                  )}
                  {m.kind === "audio" && (
                    <span className="ai-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
                  )}
                  {m.kind !== "image" && m.duration_ms ? <span className="ai-len">{clock(m.duration_ms)}</span> : null}
                  {m.source === "generated" && <span className="ai-badge">AI</span>}
                  {n > 0 && <span className="ai-order">{n}</span>}
                </button>
                {m.kind === "audio" && url && (
                  <audio id={`ai-a-${m.id}`} src={url} preload="metadata" hidden
                    onLoadedMetadata={(e) => saveDuration(m, e.currentTarget)}
                    onPlay={() => setPlaying(m.id)} onPause={() => setPlaying((p) => (p === m.id ? "" : p))} onEnded={() => setPlaying("")} />
                )}
                {canEdit ? (
                  <input className="ai-tile-label ai-tile-input" defaultValue={m.label ?? ""} placeholder="Add a label" maxLength={120}
                    aria-label="Label" onBlur={(e) => rename(m, e.target.value.trim())} />
                ) : (
                  <span className="ai-tile-label">{m.label || "Untitled"}</span>
                )}
                <div className="ai-tile-actions">
                  {m.kind === "audio" && url && <button type="button" onClick={() => play(m.id)}>{playing === m.id ? "Pause" : "Play"}</button>}
                  {url && <a href={url} target="_blank" rel="noopener noreferrer" download>Open</a>}
                  {canEdit && m.kind === "image" && <button type="button" onClick={() => toAssets(m)} disabled={!!busy}>+ Assets</button>}
                  {canEdit && <button type="button" onClick={() => remove(m)}>Delete</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
