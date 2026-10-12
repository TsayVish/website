"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  TOOLS, checkRequest, cleanParams, modelsFor, type InputFile, type MediaKind, type ModelDef, type Tool,
} from "@/lib/studio/catalog";
import { money, priceFor } from "@/lib/billing";
import { clock, type CharacterImage, type StudioMedia } from "@/lib/studio/types";

export type Target = { scriptId: string; sceneId: string; role: "clip" | "voice"; label: string };

const MAKE_TOOLS: { key: Tool; label: string }[] = [
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
  { key: "voice", label: "Voice" },
  { key: "talking", label: "Talking" },
];

const PLACEHOLDER: Record<string, string> = {
  image: "Describe the picture: sitting at a desk with a coffee and a puppy, soft morning light…",
  video: "Describe the shot: slowly looks up from the laptop and smiles at the camera…",
  voice: "Type the line to be spoken. Tags like [sighs] or [laughs] add expression.",
  talking: "",
};

type Ref = { key: string; kind: MediaKind; label: string; thumb?: string; durationMs: number | null; isBase?: boolean };

/** The prompt box: what to make, references, options and the Generate button. */
export function GeneratePanel({
  canEdit, configured, tool, model, onTool, onModel, prompt, onPrompt, params, onParams,
  selected, onSelect, media, mediaById, characterImages, urls, target, onClearTarget, balance, markup, free = false, onStart,
}: {
  canEdit: boolean;
  configured: boolean;
  tool: Tool;
  model: ModelDef;
  onTool: (t: Tool) => void;
  onModel: (id: string, params?: Record<string, string>) => void;
  prompt: string;
  onPrompt: (v: string) => void;
  params: Record<string, string>;
  onParams: (p: Record<string, string>) => void;
  selected: string[];
  onSelect: (keys: string[]) => void;
  media: StudioMedia[];
  mediaById: Map<string, StudioMedia>;
  characterImages: CharacterImage[];
  urls: Record<string, string>;
  target: Target | null;
  onClearTarget: () => void;
  balance: number;
  markup: number;
  free?: boolean;
  onStart: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [useBase, setUseBase] = useState(true);
  const [picking, setPicking] = useState(false);
  const base = characterImages.find((c) => c.key.startsWith("character:")) ?? characterImages[0];

  const opts = cleanParams(model, params);
  const toRef = (key: string): Ref | null => {
    if (key.startsWith("media:")) {
      const m = mediaById.get(key.slice(6));
      return m ? { key, kind: m.kind, label: m.label || m.kind, thumb: m.kind === "image" ? urls[m.path] : undefined, durationMs: m.duration_ms } : null;
    }
    const c = characterImages.find((x) => x.key === key);
    return c ? { key, kind: "image", label: c.label, thumb: c.url, durationMs: null } : null;
  };
  const picked = selected.map(toRef).filter((x): x is Ref => !!x);
  const slots = (k: MediaKind) => model.needs[k]?.[1] ?? 0;
  const baseApplies = !!base && useBase && slots("image") > 0 && !picked.some((p) => p.key === base.key)
    && (slots("image") > 1 || !picked.some((p) => p.kind === "image"));
  if (baseApplies) picked.unshift({ key: base.key, kind: "image", label: base.label, thumb: base.url, durationMs: null, isBase: true });
  const inputs: Ref[] = [];
  for (const p of picked) if (inputs.filter((x) => x.kind === p.kind).length < slots(p.kind)) inputs.push(p);
  const files = (k: MediaKind): InputFile[] => inputs.filter((p) => p.kind === k).map((p) => ({ kind: k, url: "", durationMs: p.durationMs }));
  const args = { prompt, params: opts, images: files("image"), audio: files("audio"), video: files("video") };
  const price = free ? 0 : priceFor(model.cost(args), markup);
  const problem = checkRequest(model, prompt, { image: args.images.length, audio: args.audio.length, video: args.video.length });
  const short = !free && price > balance;
  const takesRefs = slots("image") > 0 || slots("audio") > 0;
  const room = (slots("image") - inputs.filter((p) => p.kind === "image").length) + (slots("audio") - inputs.filter((p) => p.kind === "audio").length);

  function removeRef(r: Ref) {
    if (r.isBase) setUseBase(false);
    else onSelect(selected.filter((k) => k !== r.key));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) return setError(problem);
    if (tool === "talking" && !consent) return setError("Confirm you have the rights to this face and voice.");
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

  const soundModel = modelsFor("video").find((m) => m.options.some((o) => o.key === "generate_audio"));
  const visibleOptions = model.options.filter((o) => !o.hidden && !(o.key === "aspect_ratio" && tool === "video" && inputs.some((p) => p.kind === "image")));

  return (
    <form className="as-composer" onSubmit={submit} noValidate>
      <div className="as-tools" role="radiogroup" aria-label="What to make">
        {MAKE_TOOLS.map((t) => (
          <button key={t.key} type="button" role="radio" aria-checked={tool === t.key} onClick={() => onTool(t.key)}>{t.label}</button>
        ))}
      </div>

      {!configured && <p className="as-note warn">Generation isn’t switched on yet. You can upload files and write scripts in the meantime.</p>}
      {target && (
        <p className="as-note">
          Result goes to <b>{target.label}</b> as its {target.role === "voice" ? "voice line" : "clip"}.{" "}
          <button type="button" className="linklike" onClick={onClearTarget}>Don’t link</button>
        </p>
      )}

      {model.prompt !== "none" ? (
        <textarea id="ai-prompt" className="as-prompt" rows={tool === "voice" ? 5 : 4} maxLength={model.promptMax} value={prompt}
          aria-label={model.promptLabel} placeholder={PLACEHOLDER[tool]} onChange={(e) => onPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }} />
      ) : (
        <p className="as-help">{TOOLS.find((t) => t.key === tool)?.help} Pick a picture and a voice line below.</p>
      )}

      {takesRefs && (
        <div className="as-refs" aria-label="References">
          {inputs.map((r) => (
            <div key={r.key} className={`as-ref${r.isBase ? " base" : ""}`} title={r.label}>
              {r.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumb} alt="" />
              ) : (
                <span className="as-ref-audio" aria-hidden="true">♪<small>{clock(r.durationMs)}</small></span>
              )}
              {r.isBase && <span className="as-ref-tag">Base</span>}
              <button type="button" className="as-ref-x" aria-label={`Remove ${r.label}`} onClick={() => removeRef(r)}>×</button>
            </div>
          ))}
          {room > 0 && (
            <button type="button" className="as-ref-add" onClick={() => setPicking(true)} aria-label="Add a reference">
              <span aria-hidden="true">+</span>
              <small>{tool === "talking" && !inputs.some((p) => p.kind === "audio") ? "Voice" : "Add"}</small>
            </button>
          )}
          {base && slots("image") > 0 && !useBase && (
            <button type="button" className="linklike as-base-back" onClick={() => setUseBase(true)}>Use {base.label.toLowerCase()} as base</button>
          )}
        </div>
      )}

      <div className="as-opts">
        {modelsFor(tool).length > 1 && (
          <label className="as-pill">
            <span className="visually-hidden">Model</span>
            <select value={model.id} onChange={(e) => onModel(e.target.value)}>
              {modelsFor(tool).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
        {tool === "video" && !model.options.some((o) => o.key === "generate_audio") && soundModel && (
          // Only some video models make sound; picking "With sound" switches to one that does.
          <label className="as-pill">
            <span className="visually-hidden">Sound</span>
            <select value="off" onChange={(e) => { if (e.target.value === "on") onModel(soundModel.id, { duration: opts.duration ?? "5", generate_audio: "on" }); }}>
              <option value="off">Silent</option>
              <option value="on">With sound ({soundModel.label})</option>
            </select>
          </label>
        )}
        {visibleOptions.map((o) => (
          <label key={o.key} className="as-pill">
            <span className="visually-hidden">{o.label}</span>
            <select id={`ai-o-${o.key}`} value={opts[o.key]} onChange={(e) => onParams({ ...params, [o.key]: e.target.value })}>
              {o.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        ))}
      </div>

      {tool === "talking" && (
        <label className="as-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I own this character and voice, or have permission to use them.</span>
        </label>
      )}

      {(error || (short && canEdit)) && (
        <p className="form-error as-error" role="alert">
          {error || "Not enough credits for this."} {(short || /credits/i.test(error)) && <Link href="/studio/credits">Add credits</Link>}
        </p>
      )}

      <div className="as-go">
        <span className="as-price">{free ? "Free" : money(price)}<small>{model.label}</small></span>
        <button type="submit" className="btn" disabled={!canEdit || !configured || busy || short}>{busy ? "Starting…" : "Generate"}</button>
      </div>
      {!canEdit && <p className="as-help">You can view this studio. Ask an owner or editor to make things.</p>}

      {picking && (
        <ReferencePicker
          kinds={(["image", "audio"] as MediaKind[]).filter((k) => slots(k) > 0)}
          media={media}
          characterImages={characterImages}
          urls={urls}
          selected={selected}
          onToggle={(key) => onSelect(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])}
          onClose={() => setPicking(false)}
        />
      )}
    </form>
  );
}

/** A small sheet to pick reference pictures or voice lines from the library. */
function ReferencePicker({ kinds, media, characterImages, urls, selected, onToggle, onClose }: {
  kinds: MediaKind[];
  media: StudioMedia[];
  characterImages: CharacterImage[];
  urls: Record<string, string>;
  selected: string[];
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    box.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const items = [
    ...(kinds.includes("image") ? characterImages.map((c) => ({ key: c.key, label: c.label, thumb: c.url, kind: "image" as MediaKind, ms: null as number | null })) : []),
    ...media.filter((m) => kinds.includes(m.kind)).map((m) => ({ key: `media:${m.id}`, label: m.label || m.kind, thumb: m.kind === "image" ? urls[m.path] : undefined, kind: m.kind, ms: m.duration_ms })),
  ];
  return createPortal(
    <div className="as-sheet-back" onClick={onClose}>
      <div className="as-sheet" role="dialog" aria-modal="true" aria-label="Choose references" tabIndex={-1} ref={box} onClick={(e) => e.stopPropagation()}>
        <div className="as-sheet-head">
          <b>Choose {kinds.includes("audio") && !kinds.includes("image") ? "a voice line" : kinds.includes("audio") ? "a picture and a voice line" : "references"}</b>
          <button type="button" className="btn st-small" onClick={onClose}>Done</button>
        </div>
        {items.length === 0 ? (
          <p className="as-help">Nothing here yet. Upload files or generate some in the Library.</p>
        ) : (
          <ul className="as-pick">
            {items.map((it) => {
              const n = selected.indexOf(it.key) + 1;
              return (
                <li key={it.key}>
                  <button type="button" aria-pressed={n > 0} onClick={() => onToggle(it.key)} title={it.label}>
                    {it.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.thumb} alt="" />
                    ) : (
                      <span className="as-ref-audio" aria-hidden="true">♪<small>{clock(it.ms)}</small></span>
                    )}
                    {n > 0 && <span className="as-check">{n}</span>}
                  </button>
                  <span>{it.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.querySelector(".st") ?? document.body,
  );
}
