"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { VOICES, modelById } from "@/lib/studio/catalog";
import { money, priceFor } from "@/lib/billing";
import {
  SCRIPT_COLUMNS, clock, isPending, newSceneId, readScenes,
  type Scene, type StudioGeneration, type StudioMedia, type StudioScript,
} from "@/lib/studio/types";
import { aiWrite, saveScript } from "@/lib/ai/client";
import type { ScriptResult } from "@/lib/ai/tasks";

const STARTER: Scene[] = [
  { id: newSceneId(), shot: "", line: "" },
];

/** ✦ Write a whole episode script from a premise; it lands as a new script. */
function AIScript({ projectId, onCreated, compact = false }: { projectId: string; onCreated: (s: StudioScript) => void; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [premise, setPremise] = useState("");
  const [scenes, setScenes] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return <button type="button" className="linklike ai-script-ai-open" onClick={() => setOpen(true)}>✦ Write a new script with AI</button>;
  async function go() {
    setBusy(true); setError("");
    try {
      const { result } = await aiWrite<ScriptResult>("script", projectId, { premise, scenes });
      onCreated(await saveScript(projectId, result));
      setPremise("");
      if (compact) setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  return (
    <div className="ai-script-ai">
      <label className="lbl" htmlFor={`ai-premise-${compact ? "c" : "f"}`}>✦ Write a script with AI</label>
      <textarea id={`ai-premise-${compact ? "c" : "f"}`} className="st-input" rows={2} maxLength={2000} value={premise} onChange={(e) => setPremise(e.target.value)}
        placeholder="Premise: it’s Monday and the coffee machine is broken…" />
      <div className="ai-script-ai-go">
        <select className="st-input st-small" value={scenes} onChange={(e) => setScenes(+e.target.value)} aria-label="Scenes">
          {[3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} scenes</option>)}
        </select>
        <button type="button" className="btn st-small" disabled={busy || !premise.trim()} onClick={go}>{busy ? "Writing…" : "Write script"}</button>
        {compact && <button type="button" className="linklike" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
      {error && <p className="form-error" role="alert">{error}{/Settings → AI/.test(error) && <> <a href="/studio/settings/ai">Settings → AI</a></>}</p>}
    </div>
  );
}

export function ScriptEditor({
  projectId, canEdit, configured, scripts, script, onPick, onCreated, onDeleted, onEdit, onSaved,
  media, mediaById, urlOf, gens, onAim, onStart, markup, free = false,
}: {
  projectId: string;
  canEdit: boolean;
  configured: boolean;
  scripts: StudioScript[];
  script: StudioScript | null;
  onPick: (id: string) => void;
  onCreated: (s: StudioScript) => void;
  onDeleted: (id: string) => void;
  onEdit: (id: string, patch: Partial<StudioScript>) => void;
  onSaved: (id: string) => void;
  media: StudioMedia[];
  mediaById: Map<string, StudioMedia>;
  urlOf: (m: StudioMedia | undefined) => string | undefined;
  gens: StudioGeneration[];
  onAim: (scene: Scene, what: "clip" | "talking" | "voice") => void;
  markup: number;
  free?: boolean;
  onStart: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState<"" | "saving" | "saved" | "error">("");
  const [error, setError] = useState("");
  const [busyScene, setBusyScene] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(script);
  latest.current = script;

  // Save a moment after typing stops.
  function queueSave() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 700);
  }
  async function save() {
    const s = latest.current;
    if (!s) return;
    setSaving("saving");
    const { error: err } = await createClient().from("studio_scripts").update({ title: s.title.trim() || "Untitled script", scenes: s.scenes }).eq("id", s.id);
    if (err) { setSaving("error"); setError(err.message); return; }
    onSaved(s.id);
    setSaving("saved");
  }
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); save(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setError("");
    const { data, error: err } = await createClient().from("studio_scripts")
      .insert({ project_id: projectId, title: `Episode ${scripts.length + 1}`, scenes: STARTER.map((s) => ({ ...s, id: newSceneId() })) })
      .select(SCRIPT_COLUMNS).single();
    if (err) return setError(err.message);
    onCreated({ ...(data as StudioScript), scenes: readScenes((data as StudioScript).scenes) });
  }

  async function remove() {
    if (!script || !window.confirm(`Delete “${script.title}”? Its clips and voice lines stay in the library.`)) return;
    const { error: err } = await createClient().from("studio_scripts").delete().eq("id", script.id);
    if (err) return setError(err.message);
    onDeleted(script.id);
  }

  function setScenes(scenes: Scene[]) {
    if (!script) return;
    onEdit(script.id, { scenes });
    queueSave();
  }
  const patchScene = (id: string, patch: Partial<Scene>) => setScenes(script!.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...script!.scenes];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setScenes(next);
  };

  async function voiceLine(scene: Scene) {
    if (!script || !scene.line.trim()) return;
    setBusyScene(scene.id);
    setError("");
    try {
      await onStart({
        model: "elevenlabs-v3", prompt: scene.line, params: { voice: scene.voice || "Aria" },
        target: { scriptId: script.id, sceneId: scene.id, role: "voice" },
        label: `Scene ${script.scenes.indexOf(scene) + 1} · voice`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyScene("");
  }

  // Which scenes have something cooking.
  const cooking = (sceneId: string, role: "clip" | "voice") =>
    script ? gens.some((g) => isPending(g.status) && g.params?.script_id === script.id && g.params?.scene_id === sceneId && g.params?.scene_role === role) : false;
  const talkingIds = new Set(gens.filter((g) => g.tool === "talking").map((g) => g.id));
  const isTalking = (m: StudioMedia | undefined) => !!m?.generation_id && talkingIds.has(m.generation_id);

  const videos = media.filter((m) => m.kind === "video");
  const audios = media.filter((m) => m.kind === "audio");

  /* ── assembling ── */
  const ready = (script?.scenes ?? []).filter((s) => s.clip_media && mediaById.get(s.clip_media));
  const totalMs = ready.reduce((t, s) => t + (mediaById.get(s.clip_media!)?.duration_ms ?? 0), 0);
  const assembleCost = priceFor(modelById("ffmpeg-compose")!.cost({ prompt: "", params: {}, images: [], audio: [], video: [] }), markup);
  const assembling = script ? gens.some((g) => g.tool === "assemble" && isPending(g.status) && g.params?.script_id === script.id) : false;
  const lastCut = script ? gens.find((g) => g.tool === "assemble" && g.params?.script_id === script.id && g.status === "succeeded") : undefined;
  const lastCutMedia = lastCut ? media.find((m) => m.generation_id === lastCut.id) : undefined;

  async function assemble() {
    if (!script) return;
    setError("");
    setBusyScene("assemble");
    try {
      await onStart({
        model: "ffmpeg-compose",
        scenes: ready.map((s) => {
          const clip = mediaById.get(s.clip_media!);
          const voice = s.voice_media ? mediaById.get(s.voice_media) : undefined;
          return { clip: s.clip_media, voice: isTalking(clip) ? null : voice?.id ?? null, clipMs: clip?.duration_ms ?? null, voiceMs: voice?.duration_ms ?? null };
        }),
        scriptId: script.id,
        label: `${script.title} · full video`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyScene("");
  }

  if (!script) {
    return (
      <div className="ai-panel ai-scripts">
        <div className="ai-head"><h2>Script</h2></div>
        {scripts.length > 0 ? (
          <ul className="ai-script-list">
            {scripts.map((s) => <li key={s.id}><button type="button" className="linklike" onClick={() => onPick(s.id)}>{s.title}</button> <small>{s.scenes.length} scenes</small></li>)}
          </ul>
        ) : (
          <div className="ai-empty">
            <p>Write an episode scene by scene: what we see, and what’s said. Then make a clip and a voice line for each scene and assemble the video.</p>
          </div>
        )}
        {canEdit && <button type="button" className="btn st-small" onClick={create}>New script</button>}
        {canEdit && <AIScript projectId={projectId} onCreated={onCreated} />}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="ai-panel ai-scripts">
      <div className="ai-head">
        <h2>Script</h2>
        <div className="ai-head-tools">
          <label htmlFor="ai-script" className="visually-hidden">Script</label>
          <select id="ai-script" className="st-input" value={script.id} onChange={(e) => onPick(e.target.value)}>
            {scripts.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          {canEdit && <button type="button" className="btn ghost st-small" onClick={create}>New</button>}
        </div>
      </div>
      {canEdit && <AIScript projectId={projectId} onCreated={onCreated} compact />}

      <div className="ai-script-title">
        <label htmlFor="ai-title" className="visually-hidden">Title</label>
        <input id="ai-title" className="ai-title-input" value={script.title} maxLength={120} disabled={!canEdit}
          onChange={(e) => { onEdit(script.id, { title: e.target.value }); queueSave(); }} />
        <span className="ai-saved" aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved" : ""}</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <ol className="ai-scenes">
        {script.scenes.map((s, i) => {
          const clip = s.clip_media ? mediaById.get(s.clip_media) : undefined;
          const voice = s.voice_media ? mediaById.get(s.voice_media) : undefined;
          return (
            <li key={s.id} className="ai-scene">
              <div className="ai-scene-head">
                <b>Scene {i + 1}</b>
                {canEdit && (
                  <span className="ai-scene-tools">
                    <button type="button" aria-label={`Move scene ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" aria-label={`Move scene ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === script.scenes.length - 1}>↓</button>
                    <button type="button" aria-label={`Delete scene ${i + 1}`} onClick={() => setScenes(script.scenes.filter((x) => x.id !== s.id))}>×</button>
                  </span>
                )}
              </div>
              <div className="ai-scene-body">
                <div className="field">
                  <label className="lbl" htmlFor={`shot-${s.id}`}>What we see</label>
                  <textarea id={`shot-${s.id}`} className="st-input" rows={2} maxLength={2000} value={s.shot} disabled={!canEdit}
                    placeholder="Close-up. She slowly lifts her head off the desk." onChange={(e) => patchScene(s.id, { shot: e.target.value })} />
                </div>
                <div className="field">
                  <label className="lbl" htmlFor={`line-${s.id}`}>What’s said <span className="opt-hint">(optional)</span></label>
                  <textarea id={`line-${s.id}`} className="st-input" rows={2} maxLength={3000} value={s.line} disabled={!canEdit}
                    placeholder="“I’m not ignoring you. I’m just… buffering.”" onChange={(e) => patchScene(s.id, { line: e.target.value })} />
                </div>
              </div>

              <div className="ai-slots">
                <div className="ai-slot">
                  <span className="lbl">Clip</span>
                  {clip && urlOf(clip) ? (
                    <video className="ai-slot-video" src={urlOf(clip)} controls playsInline preload="metadata" />
                  ) : (
                    <span className="ai-slot-empty">{cooking(s.id, "clip") ? "Making the clip…" : "No clip yet"}</span>
                  )}
                  {canEdit && (
                    <div className="ai-slot-actions">
                      <button type="button" className="btn ghost st-small" onClick={() => onAim(s, "clip")} disabled={!configured}>Make clip</button>
                      <button type="button" className="btn ghost st-small" onClick={() => onAim(s, "talking")} disabled={!configured || !s.voice_media}
                        title={s.voice_media ? "Lip-sync a picture to this scene’s voice line" : "Make the voice line first"}>Talking clip</button>
                      <select className="st-input ai-slot-pick" aria-label={`Clip for scene ${i + 1}`} value={s.clip_media ?? ""} onChange={(e) => patchScene(s.id, { clip_media: e.target.value || null })}>
                        <option value="">Pick from library…</option>
                        {videos.map((m) => <option key={m.id} value={m.id}>{m.label || "Video"}{m.duration_ms ? ` (${clock(m.duration_ms)})` : ""}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="ai-slot">
                  <span className="lbl">Voice</span>
                  {voice && urlOf(voice) ? (
                    <audio className="ai-slot-audio" src={urlOf(voice)} controls preload="metadata" />
                  ) : (
                    <span className="ai-slot-empty">{cooking(s.id, "voice") ? "Recording the line…" : s.line.trim() ? "No voice yet" : "No line"}</span>
                  )}
                  {canEdit && (
                    <div className="ai-slot-actions">
                      <label className="visually-hidden" htmlFor={`voice-${s.id}`}>Voice</label>
                      <select id={`voice-${s.id}`} className="st-input ai-slot-pick" value={s.voice || "Aria"} onChange={(e) => patchScene(s.id, { voice: e.target.value })}>
                        {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <button type="button" className="btn ghost st-small" onClick={() => voiceLine(s)} disabled={!configured || !s.line.trim() || busyScene === s.id}>
                        {busyScene === s.id ? "Starting…" : "Voice it"}
                      </button>
                      <select className="st-input ai-slot-pick" aria-label={`Voice line for scene ${i + 1}`} value={s.voice_media ?? ""} onChange={(e) => patchScene(s.id, { voice_media: e.target.value || null })}>
                        <option value="">Pick from library…</option>
                        {audios.map((m) => <option key={m.id} value={m.id}>{m.label || "Audio"}{m.duration_ms ? ` (${clock(m.duration_ms)})` : ""}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {canEdit && (
        <div className="ai-script-foot">
          <button type="button" className="btn ghost st-small" onClick={() => setScenes([...script.scenes, { id: newSceneId(), shot: "", line: "" }])} disabled={script.scenes.length >= 60}>
            Add scene
          </button>
          <button type="button" className="linklike ai-danger" onClick={remove}>Delete script</button>
        </div>
      )}

      <div className="ai-assemble">
        <div>
          <b>Full video</b>
          <p className="ai-hint">
            {ready.length
              ? `${ready.length} of ${script.scenes.length} scenes have a clip${totalMs ? ` · ${clock(totalMs)} long` : ""}. Voice lines play over their clips (talking clips keep their own sound).`
              : "Give scenes a clip, then join them into one video."}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn st-small" onClick={assemble} disabled={!configured || !ready.length || assembling || busyScene === "assemble"}>
            {assembling ? "Assembling…" : free ? "Assemble" : `Assemble · ${money(assembleCost)}`}
          </button>
        )}
      </div>
      {lastCutMedia && urlOf(lastCutMedia) && (
        <div className="ai-cut">
          <video src={urlOf(lastCutMedia)} controls playsInline preload="metadata" />
          <a className="btn ghost st-small" href={urlOf(lastCutMedia)} download target="_blank" rel="noopener noreferrer">Download</a>
        </div>
      )}
    </div>
  );
}
