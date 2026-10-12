"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import type { MediaKind } from "@/lib/studio/catalog";
import { clock, type CharacterImage, type StudioMedia } from "@/lib/studio/types";
import { uploadMedia } from "./media-actions";

export type { CharacterImage };

type KindFilter = "all" | MediaKind;
type SourceFilter = "all" | "generated" | "upload";

/** Everything for this character, as a gallery. Click to open. */
export function MediaLibrary({
  projectId, canEdit, media, characterImages, urls, onUploaded, onOpen, onOpenCharacter,
}: {
  projectId: string;
  canEdit: boolean;
  media: StudioMedia[];
  characterImages: CharacterImage[];
  urls: Record<string, string>;
  onUploaded: (rows: StudioMedia[]) => void;
  onOpen: (m: StudioMedia, list: StudioMedia[]) => void;
  onOpenCharacter: (c: CharacterImage) => void;
}) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    setError("");
    try {
      const rows = await uploadMedia(projectId, files, setBusy);
      onUploaded(rows);
    } catch (e) {
      setError(`Couldn’t upload: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy("");
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

  const words = q.trim().toLowerCase();
  const shown = media.filter((m) =>
    (kind === "all" || m.kind === kind) && (source === "all" || m.source === source) && (!words || (m.label ?? "").toLowerCase().includes(words)));
  const count = (k: KindFilter) => (k === "all" ? media.length : media.filter((m) => m.kind === k).length);

  return (
    <div className="as-library" onDragOver={(e) => { e.preventDefault(); if (canEdit) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} data-dragging={dragging || undefined}>
      <div className="as-lib-bar">
        <nav className="as-seg" aria-label="Type">
          {(["all", "image", "video", "audio"] as KindFilter[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === "all" ? "All" : k === "image" ? "Images" : k === "video" ? "Videos" : "Audio"} <span>{count(k)}</span>
            </button>
          ))}
        </nav>
        <label className="as-pill">
          <span className="visually-hidden">Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value as SourceFilter)}>
            <option value="all">Made and uploaded</option>
            <option value="generated">Made with AI</option>
            <option value="upload">Uploaded</option>
          </select>
        </label>
        <input className="st-input hub-search as-lib-search" type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
        {canEdit && (
          <>
            <label className="btn st-small as-upload" htmlFor="ai-files">{busy || "Upload"}</label>
            <input id="ai-files" className="visually-hidden" type="file" multiple disabled={!!busy}
              accept="image/png,image/jpeg,image/webp,image/gif,audio/*,video/mp4,video/webm,video/quicktime" onChange={onFiles} />
          </>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      {characterImages.length > 0 && kind !== "audio" && kind !== "video" && source !== "generated" && !words && (
        <section className="as-lib-sec">
          <h3>Character</h3>
          <ul className="as-grid">
            {characterImages.map((c) => (
              <li key={c.key}>
                <button type="button" className="as-tile" onClick={() => onOpenCharacter(c)} title={c.label}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt="" loading="lazy" />
                </button>
                <span className="as-tile-name">{c.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="as-lib-sec">
        {characterImages.length > 0 && kind !== "audio" && kind !== "video" && source !== "generated" && !words && <h3>Library</h3>}
        {shown.length === 0 ? (
          <div className="as-empty">
            <b>{media.length ? "Nothing matches" : "Your library is empty"}</b>
            <p>{media.length ? "Try a different filter." : canEdit ? "Drop images, audio or video here (up to 50 MB each), or generate something in Create. Only upload things you own or have permission to use." : "Nothing has been added yet."}</p>
          </div>
        ) : (
          <ul className="as-grid">
            {shown.map((m) => {
              const url = urls[m.path];
              return (
                <li key={m.id}>
                  <button type="button" className={`as-tile as-${m.kind}`} onClick={() => onOpen(m, shown)} title={m.label ?? ""}>
                    {!url ? <span className="as-shimmer" /> : m.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" loading="lazy" />
                    ) : m.kind === "video" ? (
                      <video src={url + "#t=0.1"} muted playsInline preload="metadata" />
                    ) : (
                      <span className="as-audio-tile"><span className="ai-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></span>
                    )}
                    {m.source === "generated" && <span className="as-badge">AI</span>}
                    {m.kind !== "image" && m.duration_ms ? <span className="as-len">{clock(m.duration_ms)}</span> : null}
                    {m.kind === "video" && <span className="as-play" aria-hidden="true">▶</span>}
                  </button>
                  <span className="as-tile-name">{m.label || "Untitled"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
