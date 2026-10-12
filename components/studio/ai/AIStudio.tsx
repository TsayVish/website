"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { money } from "@/lib/billing";
import { createClient } from "@/lib/supabase/client";
import { modelById, modelsFor, type Tool } from "@/lib/studio/catalog";
import {
  MEDIA_COLUMNS, SCRIPT_COLUMNS, isPending, readScenes,
  type CharacterImage, type Scene, type StudioGeneration, type StudioMedia, type StudioScript,
} from "@/lib/studio/types";
import { MediaLibrary } from "./MediaLibrary";
import { MediaViewer, type ViewerItem } from "./MediaViewer";
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
  credits: { balance: number; markup: number; free?: boolean };
};

type Tab = "create" | "library" | "episodes";

/** The whole AI Studio for one character: library, script, generator and results. */
export function AIStudio(props: StudioProps) {
  const { project, canEdit, configured } = props;
  const [characterImages, setCharacterImages] = useState(props.characterImages);
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
  const free = props.credits.free === true;
  const [tab, setTab] = useState<Tab>("create");
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  const [notice, setNotice] = useState("");
  const dirtyScripts = useRef(new Set<string>());
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);

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
    setTab("create");
  }

  function chooseTool(t: Tool) {
    setTool(t);
    setModelId(modelsFor(t)[0].id);
    setParams({});
    setTarget(null);
  }

  const model = modelById(modelId) ?? modelsFor(tool)[0];

  /* ── viewer ── */
  const openMedia = (m: StudioMedia, list: StudioMedia[] = media) => {
    const items: ViewerItem[] = list.map((x) => ({ type: "media", m: x }));
    setViewer({ items, index: Math.max(0, list.findIndex((x) => x.id === m.id)) });
  };
  const openCharacter = (c: CharacterImage) => {
    setViewer({ items: characterImages.map((x) => ({ type: "character", c: x })), index: characterImages.findIndex((x) => x.key === c.key) });
  };
  const current = viewer ? viewer.items[viewer.index] : null;
  // Keep the viewer's item fresh after renames.
  const currentItem: ViewerItem | null = current?.type === "media" ? (mediaById.get(current.m.id) ? { type: "media", m: mediaById.get(current.m.id)! } : null) : current;

  function pickAsReference(key: string) {
    setSelected((s) => (s.includes(key) ? s : [...s, key]));
    if (tool !== "image" && tool !== "video") chooseTool("image");
    setViewer(null);
    setTab("create");
  }
  function animate(key: string) {
    chooseTool("video");
    setSelected([key]);
    setViewer(null);
    setTab("create");
  }
  async function aiEdit(key: string, change: string, label: string) {
    const [type, id] = key.split(":");
    await start({ model: "nano-banana-2", prompt: change, params: { mode: "edit", num_images: "1", aspect_ratio: "auto" }, inputs: [{ type, id }], label });
    setViewer(null);
    setTab("create");
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "create", label: "Create" },
    { key: "library", label: "Library", count: media.length },
    { key: "episodes", label: "Episodes", count: scripts.length || undefined },
  ];

  return (
    <div className="as">
      <div className="as-top">
        <nav className="as-tabs" role="tablist" aria-label="AI Studio">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
              {t.count ? <span className="as-count">{t.count}</span> : null}
              {t.key === "create" && pending && <span className="ai-dot" aria-label="Working" />}
            </button>
          ))}
        </nav>
        {free ? (
          <span className="as-credits" title="The tsayvish team turned billing off for your account">Free for you</span>
        ) : (
          <Link className="as-credits" href="/studio/credits" title="Add credits">{money(balance)} <span>credits</span></Link>
        )}
      </div>

      {notice && <p className="as-toast" role="status" onClick={() => setNotice("")}>{notice}</p>}

      {tab === "create" && (
        <div className="as-create">
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
            media={media}
            mediaById={mediaById}
            characterImages={characterImages}
            urls={urls}
            target={target}
            onClearTarget={() => setTarget(null)}
            balance={balance}
            markup={markup}
            free={free}
            onStart={start}
          />
          <GenerationFeed gens={gens} media={media} urls={urls} canEdit={canEdit} onCancel={cancel} onOpen={(m) => openMedia(m, media.filter((x) => x.source === "generated"))} />
        </div>
      )}

      {tab === "library" && (
        <MediaLibrary
          projectId={project.id}
          canEdit={canEdit}
          media={media}
          characterImages={characterImages}
          urls={urls}
          onUploaded={(rows) => setMedia((m) => [...rows, ...m])}
          onOpen={openMedia}
          onOpenCharacter={openCharacter}
        />
      )}

      {tab === "episodes" && (
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
          free={free}
          onStart={start}
        />
      )}

      {viewer && currentItem && (
        <MediaViewer
          item={currentItem}
          projectId={project.id}
          url={currentItem.type === "media" ? urls[currentItem.m.path] : undefined}
          gen={currentItem.type === "media" ? gens.find((g) => g.id === currentItem.m.generation_id) : undefined}
          canEdit={canEdit}
          configured={configured}
          free={free}
          markup={markup}
          onClose={() => setViewer(null)}
          onPrev={viewer.index > 0 ? () => setViewer((v) => (v ? { ...v, index: v.index - 1 } : v)) : undefined}
          onNext={viewer.index < viewer.items.length - 1 ? () => setViewer((v) => (v ? { ...v, index: v.index + 1 } : v)) : undefined}
          onRenamed={(id, label) => setMedia((all) => all.map((x) => (x.id === id ? { ...x, label } : x)))}
          onRemoved={(id) => {
            setMedia((all) => all.filter((x) => x.id !== id));
            setSelected((sel) => sel.filter((k) => k !== `media:${id}`));
            setViewer((v) => {
              if (!v) return v;
              const items = v.items.filter((it) => !(it.type === "media" && it.m.id === id));
              return items.length ? { items, index: Math.min(v.index, items.length - 1) } : null;
            });
          }}
          onUseAsReference={pickAsReference}
          onAnimate={animate}
          onEdit={aiEdit}
          onNotice={setNotice}
          onSavedAsset={(a) => setCharacterImages((all) => [...all, { key: `asset:${a.id}`, url: a.url, label: a.label || "Asset" }])}
          onCharacterPicture={(url) => setCharacterImages((all) => [{ key: `character:${project.id}`, url, label: "Character picture" }, ...all.filter((c) => !c.key.startsWith("character:"))])}
        />
      )}
    </div>
  );
}
