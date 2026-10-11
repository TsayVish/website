"use client";

import { useState, type FormEvent } from "react";
import {
  TOOLS, checkRequest, cleanParams, modelsFor, type InputFile, type MediaKind, type ModelDef, type Tool,
} from "@/lib/studio/catalog";
import Link from "next/link";
import { money, priceFor } from "@/lib/billing";
import type { StudioMedia } from "@/lib/studio/types";
import type { CharacterImage } from "./MediaLibrary";

export type Target = { scriptId: string; sceneId: string; role: "clip" | "voice"; label: string };

const MAKE_TOOLS = TOOLS.filter((t) => t.key !== "assemble");

export function GeneratePanel({
  canEdit, configured, tool, model, onTool, onModel, prompt, onPrompt, params, onParams,
  selected, onSelect, mediaById, characterImages, urls, target, onClearTarget, balance, markup, onStart,
}: {
  canEdit: boolean;
  configured: boolean;
  tool: Tool;
  model: ModelDef;
  onTool: (t: Tool) => void;
  onModel: (id: string) => void;
  prompt: string;
  onPrompt: (v: string) => void;
  params: Record<string, string>;
  onParams: (p: Record<string, string>) => void;
  selected: string[];
  onSelect: (keys: string[]) => void;
  mediaById: Map<string, StudioMedia>;
  characterImages: CharacterImage[];
  urls: Record<string, string>;
  target: Target | null;
  onClearTarget: () => void;
  balance: number;
  markup: number;
  onStart: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);

  const opts = cleanParams(model, params);

  // What's selected in the library, in order, as inputs this model can use.
  const picked = selected.map((key) => {
    if (key.startsWith("media:")) {
      const m = mediaById.get(key.slice(6));
      return m ? { key, kind: m.kind, label: m.label || m.kind, thumb: m.kind === "image" ? urls[m.path] : undefined, durationMs: m.duration_ms } : null;
    }
    const c = characterImages.find((x) => x.key === key);
    return c ? { key, kind: "image" as MediaKind, label: c.label, thumb: c.url, durationMs: null } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const usable = picked.filter((p) => (model.needs[p.kind]?.[1] ?? 0) > 0);
  const ignored = picked.length - usable.length;
  // Keep only as many of each kind as the model takes.
  const inputs: typeof picked = [];
  for (const p of usable) if (inputs.filter((x) => x.kind === p.kind).length < (model.needs[p.kind]?.[1] ?? 0)) inputs.push(p);
  const files = (k: MediaKind): InputFile[] => inputs.filter((p) => p.kind === k).map((p) => ({ kind: k, url: "", durationMs: p.durationMs }));
  const args = { prompt, params: opts, images: files("image"), audio: files("audio"), video: files("video") };
  const price = priceFor(model.cost(args), markup);
  const problem = checkRequest(model, prompt, { image: args.images.length, audio: args.audio.length, video: args.video.length });
  const short = price > balance;
  const needsConsent = tool === "talking";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) return setError(problem);
    if (needsConsent && !consent) return setError("Confirm you have the rights to this face and voice.");
    setBusy(true);
    setError("");
    try {
      await onStart({
        model: model.id,
        prompt,
        params: opts,
        inputs: inputs.map((p) => {
          const [type, id] = p.key.split(":");
          return { type, id };
        }),
        target: target ? { scriptId: target.scriptId, sceneId: target.sceneId, role: target.role } : null,
        label: target ? `${target.label} · ${target.role === "voice" ? "voice" : "clip"}` : undefined,
      });
      if (target) onClearTarget();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  const needText = (k: MediaKind) => {
    const [min, max] = model.needs[k] ?? [0, 0];
    if (!max) return null;
    const noun = k === "image" ? "picture" : k === "audio" ? "voice line" : "video";
    if (min === max) return `${min} ${noun}${min > 1 ? "s" : ""}`;
    if (min === 0) return `up to ${max} ${noun}${max > 1 ? "s" : ""} (optional)`;
    return `${min}–${max} ${noun}s`;
  };
  const needs = (["image", "audio", "video"] as MediaKind[]).map(needText).filter(Boolean);

  return (
    <form className="ai-panel ai-generator" onSubmit={submit} noValidate>
      <div className="ai-head">
        <h2>Generate</h2>
        <span className="ai-usage">
          Credits <b>{money(balance)}</b> · <Link href="/studio/credits">Top up</Link>
        </span>
      </div>

      {!configured && (
        <p className="ai-off" role="status">AI generation isn’t switched on yet. You can upload files and write scripts now; generating starts once the tsayvish team adds the AI provider key.</p>
      )}

      <div className="ai-tools" role="radiogroup" aria-label="What to make">
        {MAKE_TOOLS.map((t) => (
          <button key={t.key} type="button" role="radio" aria-checked={tool === t.key} className="ai-tool" onClick={() => onTool(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="ai-hint">{TOOLS.find((t) => t.key === tool)?.help}</p>

      {target && (
        <div className="ai-target">
          <span>Result goes to <b>{target.label}</b> as its {target.role === "voice" ? "voice line" : "clip"}.</span>
          <button type="button" className="linklike" onClick={onClearTarget}>Don’t link</button>
        </div>
      )}

      {modelsFor(tool).length > 1 && (
        <div className="field">
          <label className="lbl" htmlFor="ai-model">Model</label>
          <select id="ai-model" className="st-input" value={model.id} onChange={(e) => onModel(e.target.value)}>
            {modelsFor(tool).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      )}
      <p className="ai-model-blurb">{model.blurb}</p>

      {model.prompt !== "none" && (
        <div className="field">
          <label className="lbl" htmlFor="ai-prompt">{model.promptLabel}</label>
          <textarea id="ai-prompt" className="st-input" rows={tool === "voice" ? 4 : 3} maxLength={model.promptMax} value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
            placeholder={tool === "voice" ? "Ugh. Five more minutes. [sighs] Okay, fine." : tool === "video" ? "Slowly yawns, rubs eyes, slumps into the pillow. Soft morning light." : "Sitting at a tiny desk with a laptop, looking exhausted, coffee mug, cozy room"} />
          {tool === "voice" && <small className="ai-hint">Tip: tags like [sighs], [whispers] or [laughs] add expression.</small>}
        </div>
      )}

      {model.options.length > 0 && (
        <div className="ai-options">
          {model.options.map((o) => (
            <div key={o.key} className="field">
              <label className="lbl" htmlFor={`ai-o-${o.key}`}>{o.label}</label>
              <select id={`ai-o-${o.key}`} className="st-input" value={opts[o.key]} onChange={(e) => onParams({ ...params, [o.key]: e.target.value })}>
                {o.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {needs.length > 0 && (
        <div className="ai-inputs">
          <span className="lbl">Uses {needs.join(" and ")}</span>
          {inputs.length ? (
            <ul className="ai-chips">
              {inputs.map((p) => (
                <li key={p.key} className="ai-chip">
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" />
                  ) : <span className="ai-chip-icon" aria-hidden="true">{p.kind === "audio" ? "♪" : "▶"}</span>}
                  <span>{p.label}</span>
                  <button type="button" aria-label={`Remove ${p.label}`} onClick={() => onSelect(selected.filter((k) => k !== p.key))}>×</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ai-hint">Pick from the library{characterImages.length ? " or the character’s pictures" : ""}.</p>
          )}
          {ignored > 0 && <p className="ai-hint">{ignored} selected file{ignored > 1 ? "s aren’t" : " isn’t"} used by this tool.</p>}
        </div>
      )}

      {needsConsent && (
        <label className="ai-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I own this character and voice, or have permission to use them. I won’t use this to imitate a real person without their consent.</span>
        </label>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error} {/credits/i.test(error) && <Link href="/studio/credits">Add credits</Link>}
        </p>
      )}
      {short && !error && canEdit && (
        <p className="form-error" role="alert">Not enough credits for this. <Link href="/studio/credits">Add credits</Link></p>
      )}

      <div className="ai-go">
        <span className="ai-cost">{money(price)}</span>
        <button type="submit" className="btn" disabled={!canEdit || !configured || busy || short}>
          {busy ? "Starting…" : "Generate"}
        </button>
      </div>
      {!canEdit && <p className="ai-hint">You can view this studio. Ask an owner or editor to make things.</p>}
    </form>
  );
}
