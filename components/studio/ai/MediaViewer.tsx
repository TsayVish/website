"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money, priceFor } from "@/lib/billing";
import { modelById } from "@/lib/studio/catalog";
import { clock, type CharacterImage, type StudioGeneration, type StudioMedia } from "@/lib/studio/types";
import { createClient } from "@/lib/supabase/client";
import { copyToAssets, downloadFile, fileName, makeCharacterPicture, removeMedia, renameMedia, saveDuration } from "./media-actions";

export type ViewerItem = { type: "media"; m: StudioMedia } | { type: "character"; c: CharacterImage };

const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const fmtSize = (b: number | null) => (b == null ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** Full-size view of one library item, with everything you can do to it. */
export function MediaViewer({
  item, projectId, url, gen, canEdit, configured, free, markup, onClose, onPrev, onNext,
  onRenamed, onRemoved, onUseAsReference, onAnimate, onEdit, onNotice, onCharacterPicture, onSavedAsset, onAssetRemoved,
}: {
  item: ViewerItem;
  projectId: string;
  url?: string;
  gen?: StudioGeneration;
  canEdit: boolean;
  configured: boolean;
  free: boolean;
  markup: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onRenamed: (id: string, label: string) => void;
  onRemoved: (id: string) => void;
  onUseAsReference: (key: string) => void;
  onAnimate: (key: string) => void;
  onEdit: (key: string, change: string, label: string) => Promise<unknown>;
  onNotice: (text: string) => void;
  onCharacterPicture: (url: string) => void;
  onSavedAsset: (a: { id: string; url: string; label: string | null }) => void;
  onAssetRemoved: (key: string) => void;
}) {
  const m = item.type === "media" ? item.m : null;
  const key = m ? `media:${m.id}` : item.type === "character" ? item.c.key : "";
  const src = m ? url : item.type === "character" ? item.c.url : undefined;
  const isImage = !m || m.kind === "image";
  const label = m ? m.label ?? "" : item.type === "character" ? item.c.label : "";
  const [name, setName] = useState(label);
  const [change, setChange] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { setName(label); setChange(""); setError(""); }, [key, label]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select");
      if (e.key === "Escape") onClose();
      else if (!typing && e.key === "ArrowLeft" && onPrev) onPrev();
      else if (!typing && e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, onPrev, onNext]);
  useEffect(() => { box.current?.focus(); }, []);

  async function run(what: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(what);
    setError("");
    try {
      await fn();
      if (done) onNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy("");
  }

  const editPrice = free ? "Free" : money(priceFor(modelById("nano-banana-2")!.cost({ prompt: change, params: { num_images: "1" }, images: [], audio: [], video: [] }), markup));

  return createPortal(
    <div className="as-viewer-back" onClick={onClose}>
      <div className="as-viewer" role="dialog" aria-modal="true" aria-label={label || "Preview"} tabIndex={-1} ref={box} onClick={(e) => e.stopPropagation()}>
        <div className="as-viewer-stage">
          {onPrev && <button type="button" className="as-nav prev" onClick={onPrev} aria-label="Previous">‹</button>}
          {!src ? <span className="as-shimmer" /> : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={label} />
          ) : m!.kind === "video" ? (
            <video src={src} controls playsInline autoPlay onLoadedMetadata={(e) => { if (canEdit && !m!.duration_ms && Number.isFinite(e.currentTarget.duration)) saveDuration(m!.id, Math.round(e.currentTarget.duration * 1000)); }} />
          ) : (
            <div className="as-viewer-audio">
              <span className="ai-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
              <audio src={src} controls autoPlay onLoadedMetadata={(e) => { if (canEdit && !m!.duration_ms && Number.isFinite(e.currentTarget.duration)) saveDuration(m!.id, Math.round(e.currentTarget.duration * 1000)); }} />
            </div>
          )}
          {onNext && <button type="button" className="as-nav next" onClick={onNext} aria-label="Next">›</button>}
        </div>

        <aside className="as-viewer-side">
          <div className="as-viewer-top">
            {m && canEdit ? (
              <input className="as-name" value={name} maxLength={120} placeholder="Add a name" aria-label="Name"
                onChange={(e) => setName(e.target.value)}
                onBlur={() => { if (name.trim() !== (m.label ?? "")) run("rename", async () => { await renameMedia(m.id, name.trim()); onRenamed(m.id, name.trim()); }); }} />
            ) : <h2 className="as-name">{label || "Untitled"}</h2>}
            <button type="button" className="as-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          <dl className="as-meta">
            {m ? (
              <>
                <div><dt>Type</dt><dd>{m.kind === "image" ? "Image" : m.kind === "video" ? "Video" : "Audio"}{m.duration_ms ? ` · ${clock(m.duration_ms)}` : ""}{m.bytes ? ` · ${fmtSize(m.bytes)}` : ""}</dd></div>
                <div><dt>Source</dt><dd>{m.source === "generated" ? `Made with ${modelById(gen?.model ?? "")?.label ?? "AI"}` : "Uploaded"}</dd></div>
                <div><dt>Added</dt><dd>{fmtWhen(m.created_at)}</dd></div>
                {gen?.prompt && <div className="wide"><dt>Prompt</dt><dd>{gen.prompt}</dd></div>}
              </>
            ) : (
              <div className="wide"><dt>Source</dt><dd>Saved on the character</dd></div>
            )}
          </dl>

          <div className="as-actions">
            {src && <button type="button" className="btn ghost st-small" onClick={() => (m ? downloadFile(src, fileName(m)) : downloadFile(src, `${label || "character"}.png`))}>Download</button>}
            {m && m.kind !== "audio" && canEdit && <Link className="btn ghost st-small" href={`/studio/p/${projectId}/social?media=${m.id}`}>Post to social</Link>}
            {isImage && canEdit && <button type="button" className="btn ghost st-small" onClick={() => onUseAsReference(key)}>Use as reference</button>}
            {isImage && canEdit && configured && <button type="button" className="btn ghost st-small" onClick={() => onAnimate(key)}>Animate</button>}
            {m && isImage && canEdit && src && (
              <>
                <button type="button" className="btn ghost st-small" disabled={!!busy}
                  onClick={() => run("assets", async () => onSavedAsset(await copyToAssets(projectId, src, m.label ?? "")), "Saved to the character’s Assets.")}>
                  {busy === "assets" ? "Saving…" : "Save to Assets"}
                </button>
                <button type="button" className="btn ghost st-small" disabled={!!busy}
                  onClick={() => run("picture", async () => { const u = await makeCharacterPicture(projectId, src, m.label ?? ""); onCharacterPicture(u); }, "This is now the character’s picture.")}>
                  {busy === "picture" ? "Setting…" : "Set as character picture"}
                </button>
              </>
            )}
          </div>

          {isImage && canEdit && configured && (
            <form className="as-edit" onSubmit={(e) => { e.preventDefault(); if (change.trim()) run("edit", async () => { await onEdit(key, change.trim(), `Edit of ${label || "image"}`); setChange(""); }, "Editing… the new version will appear in Create and the Library."); }}>
              <label className="lbl" htmlFor="as-edit">Edit with AI</label>
              <textarea id="as-edit" className="st-input" rows={2} maxLength={1500} value={change} onChange={(e) => setChange(e.target.value)}
                placeholder="Make the background a sunny park, add a red scarf…" />
              <div className="as-edit-go">
                <small>Makes a new version; this one stays. {editPrice}</small>
                <button type="submit" className="btn st-small" disabled={!change.trim() || !!busy}>{busy === "edit" ? "Starting…" : "Edit"}</button>
              </div>
            </form>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          {!m && canEdit && key.startsWith("asset:") && (
            <button type="button" className="linklike ai-danger as-delete" disabled={!!busy}
              onClick={() => { if (window.confirm(`Remove “${label || "this picture"}” from the character’s Assets?`)) run("delete", async () => {
                const { error: err } = await createClient().from("character_assets").delete().eq("id", key.slice(6));
                if (err) throw new Error(err.message);
                onAssetRemoved(key);
              }, "Removed from Assets."); }}>
              Remove from Assets
            </button>
          )}
          {m && canEdit && (
            <button type="button" className="linklike ai-danger as-delete" disabled={!!busy}
              onClick={() => { if (window.confirm(`Delete “${m.label || "this file"}”? This can’t be undone.`)) run("delete", async () => { await removeMedia(m); onRemoved(m.id); }, "Deleted."); }}>
              Delete from library
            </button>
          )}
        </aside>
      </div>
    </div>,
    document.querySelector(".st") ?? document.body,
  );
}
