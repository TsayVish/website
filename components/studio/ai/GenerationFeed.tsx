"use client";

import { useState } from "react";
import { money } from "@/lib/billing";
import { modelById, toolLabel } from "@/lib/studio/catalog";
import { agoInline } from "@/lib/offers";
import { STATUS_TEXT, isPending, type StudioGeneration, type StudioMedia } from "@/lib/studio/types";

const PAGE = 18;

/** Results as a gallery, newest first. Click a result to open it. */
export function GenerationFeed({
  gens, media, urls, canEdit, onCancel, onOpen, onDelete,
}: {
  gens: StudioGeneration[];
  media: StudioMedia[];
  urls: Record<string, string>;
  canEdit: boolean;
  onCancel: (id: string) => void;
  onOpen: (m: StudioMedia) => void;
  onDelete: (g: StudioGeneration) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const list = gens.filter((g) => g.tool !== "assemble" || g.status !== "canceled");

  if (!list.length) {
    return (
      <div className="as-empty">
        <b>Your results show up here</b>
        <p>Describe what you want on the left and press Generate. Everything you make is also saved to the Library.</p>
      </div>
    );
  }

  return (
    <div className="as-results-wrap">
      <ul className="as-results">
        {list.slice(0, shown).map((g) => {
          const outs = media.filter((m) => m.generation_id === g.id);
          const title = g.params?.label || g.prompt || toolLabel(g.tool);
          const meta = `${modelById(g.model)?.label ?? g.model} · ${agoInline(g.created_at)} · ${g.price_cents ? money(g.price_cents) : "free"}${g.status === "failed" && g.price_cents ? " refunded" : ""}`;
          return (
            <li key={g.id} className={`as-result as-${g.status}`}>
              <div className={`as-result-media n${Math.min(outs.length, 4)} as-k-${g.tool}`}>
                {isPending(g.status) ? (
                  <div className="as-wait">
                    <span className="as-spin" aria-hidden="true" />
                    <span>{STATUS_TEXT[g.status]}…</span>
                    <small>{g.tool === "image" || g.tool === "voice" ? "Usually under a minute" : "Usually 1–5 minutes"}</small>
                    {canEdit && <button type="button" className="linklike" onClick={() => onCancel(g.id)}>Stop</button>}
                  </div>
                ) : g.status !== "succeeded" ? (
                  <div className="as-wait as-fail">
                    <b>{STATUS_TEXT[g.status]}</b>
                    {g.error && <small>{g.error}</small>}
                  </div>
                ) : (
                  outs.map((m) => {
                    const url = urls[m.path];
                    return (
                      <button key={m.id} type="button" className="as-out" onClick={() => onOpen(m)} aria-label={`Open ${m.label || m.kind}`}>
                        {!url ? <span className="as-shimmer" /> : m.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" loading="lazy" />
                        ) : m.kind === "video" ? (
                          <video src={url + "#t=0.1"} muted playsInline preload="metadata" />
                        ) : (
                          <span className="as-audio-tile"><span className="ai-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></span>
                        )}
                        {m.kind === "video" && <span className="as-play" aria-hidden="true">▶</span>}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="as-result-cap">
                <div>
                  <p title={title}>{title}</p>
                  <small>{meta}</small>
                </div>
                {canEdit && !isPending(g.status) && (
                  <button type="button" className="as-trash" aria-label={`Delete ${title}`} title="Delete"
                    onClick={() => { if (window.confirm(outs.length ? `Delete this result and its ${outs.length > 1 ? `${outs.length} files` : "file"}? This can’t be undone.` : "Remove this from your results?")) onDelete(g); }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > shown && <button type="button" className="btn ghost st-small as-more" onClick={() => setShown((n) => n + PAGE)}>Show more</button>}
    </div>
  );
}
