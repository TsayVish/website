"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { modelById, modelsFor, type Tool } from "@/lib/studio/catalog";
import {
  MEDIA_COLUMNS, SCRIPT_COLUMNS, isPending, readScenes,
  type Scene, type StudioGeneration, type StudioMedia, type StudioScript,
} from "@/lib/studio/types";
import { MediaLibrary, type CharacterImage } from "./MediaLibrary";
import { ScriptEditor } from "./ScriptEditor";
import { GeneratePanel, type Target } from "./GeneratePanel";
import { GenerationFeed } from "./GenerationFeed";

export type StudioProps = {
  project: { id: string; name: string };
  canEdit: boolean;
  configured: boolean;
  characterImages: CharacterImage[];
  media: StudioMedia[];
  scripts: StudioScript[];
  generations: StudioGeneration[];
  credits: { balance: number; markup: number };
};

type Pane = "library" | "script" | "generate";

/** The whole AI Studio for one character: library, script, generator and results. */
export function AIStudio(props: StudioProps) {
  const { project, canEdit, configured, characterImages } = props;
  const [media, setMedia] = useState(props.media);
  const [gens, setGens] = useState(props.generations);
  const [scripts, setScripts] = useState(props.scripts.map((s) => ({ ...s, scenes: readScenes(s.scenes) })));
  const [scriptId, setScriptId] = useState<string | null>(props.scripts[0]?.id ?? null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("image");
  const [modelId, setModelId] = useState(modelsFor("image")[0].id);
  const [prompt, setPrompt] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Target | null>(null);
  const [balance, setBalance] = useState(props.credits.balance);
  const markup = props.credits.markup;
  const [pane, setPane] = useState<Pane>("generate");
  const [notice, setNotice] = useState("");
  const dirtyScripts = useRef(new Set<string>());

  /* ── signed URLs for private files ── */
  const signing = useRef(new Set<string>());
  useEffect(() => {
    const need = media.map((m) => m.path).filter((p) => !urls[p] && !signing.current.has(p));
    if (!need.length) return;
    need.forEach((p) => signing.current.add(p));
    createClient().storage.from("studio-media").createSignedUrls(need, 60 * 60 * 6).then(({ data }) => {
      const next: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
      setUrls((u) => ({ ...u, ...next }));
    });
  }, [media, urls]);

  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const urlOf = useCallback((m: StudioMedia | undefined) => (m ? urls[m.path] : undefined), [urls]);

  /* ── reloading after jobs finish ── */
  const reloadMedia = useCallback(async () => {
    const { data } = await createClient().from("studio_media").select(MEDIA_COLUMNS).eq("project_id", project.id)
      .order("created_at", { ascending: false }).limit(300);
    if (data) setMedia(data as StudioMedia[]);
  }, [project.id]);

  const reloadScripts = useCallback(async () => {
    const { data } = await createClient().from("studio_scripts").select(SCRIPT_COLUMNS).eq("project_id", project.id).order("updated_at", { ascending: false });
    if (!data) return;
    setScripts((local) => (data as StudioScript[]).map((remote) => {
      const mine = local.find((l) => l.id === remote.id);
      const fresh = readScenes(remote.scenes);
      if (!mine || !dirtyScripts.current.has(remote.id)) return { ...remote, scenes: fresh };
      // Keep unsaved text; take newly linked results from the server.
      return {
        ...mine,
        scenes: mine.scenes.map((s) => {
          const r = fresh.find((f) => f.id === s.id);
          return r ? { ...s, clip_media: s.clip_media || r.clip_media, voice_media: s.voice_media || r.voice_media } : s;
        }),
      };
    }));
  }, [project.id]);

  // Failed jobs are refunded by the database; read the balance back.
  const reloadBalance = useCallback(async () => {
    const { data } = await createClient().rpc("credit_balance");
    if (typeof data === "number") setBalance(data);
  }, []);

  /* ── polling running jobs ── */
  const pending = gens.filter((g) => isPending(g.status)).map((g) => g.id).join(",");
  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    const ids = pending.split(",");
    const tick = async () => {
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch(`/api/studio/generations/${id}`, { cache: "no-store" });
          const body = await res.json();
          return res.ok ? (body.job as StudioGeneration) : null;
        } catch {
          return null;
        }
      }));
      if (stopped) return;
      const done = results.filter((j): j is StudioGeneration => !!j && !isPending(j.status));
      setGens((g) => g.map((x) => results.find((r) => r?.id === x.id) ?? x));
      if (done.some((j) => j.status === "succeeded")) {
        await reloadMedia();
        await reloadScripts();
      }
      if (done.some((j) => j.status !== "succeeded")) await reloadBalance();
    };
    const timer = setInterval(tick, 4000);
    const first = setTimeout(tick, 1500);
    return () => { stopped = true; clearInterval(timer); clearTimeout(first); };
  }, [pending, reloadMedia, reloadScripts, reloadBalance]);

  /* ── starting jobs ── */
  async function start(body: Record<string, unknown>) {
    setNotice("");
    const res = await fetch("/api/studio/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, ...body }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "Couldn’t start that. Try again.");
    const job = (out.job ?? null) as StudioGeneration | null;
    if (job) {
      setGens((g) => [job, ...g.filter((x) => x.id !== job.id)]);
      setBalance((b) => b - (job.price_cents ?? 0));
      if (!isPending(job.status)) reloadBalance();
    }
    return job;
  }

  async function cancel(id: string) {
    const g = gens.find((x) => x.id === id);
    if (g?.status === "running" && !window.confirm("Stop this? It has already started, so its credits won’t be returned.")) return;
    const res = await fetch(`/api/studio/generations/${id}`, { method: "DELETE" });
    const out = await res.json().catch(() => ({}));
    if (out.job) setGens((g) => g.map((x) => (x.id === id ? out.job : x)));
    reloadBalance();
  }

  /* ── script helpers ── */
  const script = scripts.find((s) => s.id === scriptId) ?? null;

  function editScript(id: string, patch: Partial<StudioScript>) {
    dirtyScripts.current.add(id);
    setScripts((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function markSaved(id: string) {
    dirtyScripts.current.delete(id);
  }

  /** From a scene: prefill the generator and point its result at the scene. */
  function aimAtScene(scene: Scene, what: "clip" | "talking" | "voice") {
    if (!script) return;
    const t: Tool = what === "clip" ? "video" : what === "talking" ? "talking" : "voice";
    chooseTool(t);
    setPrompt(what === "clip" ? scene.shot : what === "voice" ? scene.line : "");
    if (what === "voice" && scene.voice) setParams((p) => ({ ...p, voice: scene.voice! }));
    const sceneNo = script.scenes.findIndex((s) => s.id === scene.id) + 1;
    setTarget({ scriptId: script.id, sceneId: scene.id, role: what === "voice" ? "voice" : "clip", label: `Scene ${sceneNo}` });
    if (what === "talking" && scene.voice_media) {
      setSelected((sel) => [...sel.filter((k) => !k.startsWith("media:") || mediaById.get(k.slice(6))?.kind !== "audio"), `media:${scene.voice_media}`]);
    }
    setPane("generate");
  }

  function chooseTool(t: Tool) {
    setTool(t);
    setModelId(modelsFor(t)[0].id);
    setParams({});
    setTarget(null);
  }

  const model = modelById(modelId) ?? modelsFor(tool)[0];

  return (
    <div className="ai">
      <div className="ai-panes-nav st-tabs" role="tablist" aria-label="Studio sections">
        {(["library", "script", "generate"] as Pane[]).map((p) => (
          <button key={p} type="button" role="tab" aria-selected={pane === p} aria-current={pane === p ? "page" : undefined} onClick={() => setPane(p)}>
            {p === "library" ? "Library" : p === "script" ? "Script" : "Generate"}
            {p === "generate" && pending && <span className="ai-dot" aria-label="Working" />}
          </button>
        ))}
      </div>

      {notice && <p className="ai-notice" role="status">{notice}</p>}

      <div className="ai-grid" data-pane={pane}>
        <section className="ai-col ai-lib" aria-label="Library">
          <MediaLibrary
            projectId={project.id}
            canEdit={canEdit}
            media={media}
            characterImages={characterImages}
            urls={urls}
            selected={selected}
            onSelect={setSelected}
            onUploaded={(rows) => setMedia((m) => [...rows, ...m])}
            onRemoved={(id) => { setMedia((m) => m.filter((x) => x.id !== id)); setSelected((s) => s.filter((k) => k !== `media:${id}`)); }}
            onDuration={(id, ms) => setMedia((m) => m.map((x) => (x.id === id ? { ...x, duration_ms: ms } : x)))}
            onNotice={setNotice}
          />
        </section>

        <section className="ai-col ai-script" aria-label="Script">
          <ScriptEditor
            projectId={project.id}
            canEdit={canEdit}
            configured={configured}
            scripts={scripts}
            script={script}
            onPick={setScriptId}
            onCreated={(s) => { setScripts((all) => [s, ...all]); setScriptId(s.id); }}
            onDeleted={(id) => { setScripts((all) => all.filter((s) => s.id !== id)); setScriptId((cur) => (cur === id ? null : cur)); }}
            onEdit={editScript}
            onSaved={markSaved}
            media={media}
            mediaById={mediaById}
            urlOf={urlOf}
            gens={gens}
            onAim={aimAtScene}
            markup={markup}
            onStart={start}
          />
        </section>

        <section className="ai-col ai-gen" aria-label="Generate">
          <GeneratePanel
            canEdit={canEdit}
            configured={configured}
            tool={tool}
            model={model}
            onTool={chooseTool}
            onModel={(id) => { setModelId(id); setParams({}); }}
            prompt={prompt}
            onPrompt={setPrompt}
            params={params}
            onParams={setParams}
            selected={selected}
            onSelect={setSelected}
            mediaById={mediaById}
            characterImages={characterImages}
            urls={urls}
            target={target}
            onClearTarget={() => setTarget(null)}
            balance={balance}
            markup={markup}
            onStart={start}
          />
          <GenerationFeed
            gens={gens}
            media={media}
            urls={urls}
            canEdit={canEdit}
            onCancel={cancel}
            onNotice={setNotice}
            onUse={(m) => { setSelected((s) => (s.includes(`media:${m.id}`) ? s : [...s, `media:${m.id}`])); setNotice(`Selected “${m.label || "result"}” in the library.`); }}
          />
        </section>
      </div>
    </div>
  );
}
