"use client";

import { useState } from "react";
import { modelById, toolLabel } from "@/lib/studio/catalog";
import { money } from "@/lib/billing";
import { STATUS_TEXT, isPending, type StudioGeneration, type StudioMedia } from "@/lib/studio/types";
import { agoInline } from "@/lib/offers";

const PAGE = 12;

/** Everything made for this character, newest first, with live status. */
export function GenerationFeed({
  gens, media, urls, canEdit, onCancel, onUse,
}: {
  gens: StudioGeneration[];
  media: StudioMedia[];
  urls: Record<string, string>;
  canEdit: boolean;
  onCancel: (id: string) => void;
  onNotice: (text: string) => void;
  onUse: (m: StudioMedia) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  if (!gens.length) {
    return (
      <div className="ai-panel ai-feed">
        <div className="ai-head"><h2>Results</h2></div>
        <div className="ai-empty"><p>What you make shows up here, and in the library.</p></div>
      </div>
    );
  }
  return (
    <div className="ai-panel ai-feed">
      <div className="ai-head"><h2>Results</h2></div>
      <ul className="ai-results">
        {gens.slice(0, shown).map((g) => {
          const outs = media.filter((m) => m.generation_id === g.id);
          const title = g.params?.label || g.prompt || toolLabel(g.tool);
          return (
            <li key={g.id} className={`ai-result ai-${g.status}`}>
              <div className="ai-result-head">
                <span className="ai-result-what">
                  <b>{toolLabel(g.tool)}</b>
                  <small>{modelById(g.model)?.label ?? g.model} · {agoInline(g.created_at)} · {money(g.price_cents ?? 0)}{g.status === "failed" && g.price_cents ? " refunded" : ""}</small>
                </span>
                <span className={`ai-status ai-${g.status}`}>
                  {isPending(g.status) && <span className="ai-spin" aria-hidden="true" />}
                  {STATUS_TEXT[g.status]}
                </span>
              </div>
              {title && <p className="ai-result-prompt" title={title}>{title}</p>}
              {g.status === "failed" && g.error && <p className="ai-result-error">{g.error}</p>}
              {isPending(g.status) && (
                <div className="ai-result-wait">
                  <span>{g.tool === "image" || g.tool === "voice" ? "Usually under a minute." : "Clips usually take 1–5 minutes. You can leave this page; it keeps going."}</span>
                  {canEdit && <button type="button" className="linklike" onClick={() => onCancel(g.id)}>Stop</button>}
                </div>
              )}
              {outs.length > 0 && (
                <div className={`ai-outs n${Math.min(outs.length, 4)}`}>
                  {outs.map((m) => {
                    const url = urls[m.path];
                    if (!url) return <span key={m.id} className="ai-out ai-out-loading" />;
                    return (
                      <div key={m.id} className="ai-out">
                        {m.kind === "image" && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={title} loading="lazy" /></a>
                        )}
                        {m.kind === "video" && <video src={url} controls playsInline preload="metadata" />}
                        {m.kind === "audio" && <audio src={url} controls preload="metadata" />}
                        <div className="ai-out-actions">
                          <button type="button" className="linklike" onClick={() => onUse(m)}>Use</button>
                          <a href={url} download target="_blank" rel="noopener noreferrer">Download</a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {gens.length > shown && <button type="button" className="btn ghost st-small" onClick={() => setShown((n) => n + PAGE)}>Show more</button>}
    </div>
  );
}
