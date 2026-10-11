"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { ASSET_KINDS, type AssetKind, type CharacterAsset } from "@/lib/characters";
import { createClient } from "@/lib/supabase/client";
import { checkImage, uploadCharacterImage } from "@/lib/upload";

/** Every image for a character: reference sheets, turnarounds, expressions, logos. */
export function AssetLibrary({ projectId, assets, canEdit }: { projectId: string; assets: CharacterAsset[]; canEdit: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<AssetKind>("reference");
  const [filter, setFilter] = useState<AssetKind | "all">("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, 20);
    e.target.value = "";
    if (!files.length) return;
    const bad = files.map((f) => checkImage(f)).find(Boolean);
    if (bad) return setError(bad);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const url = await uploadCharacterImage(files[i]);
        const label = files[i].name.replace(/\.[^.]+$/, "").slice(0, 80);
        const { error: err } = await supabase.from("character_assets").insert({ project_id: projectId, added_by: user?.id, kind, label, url });
        if (err) throw new Error(err.message);
      }
    } catch (err) {
      setError(`Couldn’t upload: ${err instanceof Error ? err.message : String(err)}`);
    }
    setBusy("");
    router.refresh();
  }

  async function remove(a: CharacterAsset) {
    setBusy("Removing…");
    const { error: err } = await createClient().from("character_assets").delete().eq("id", a.id);
    setBusy("");
    if (err) return setError(err.message);
    router.refresh();
  }

  async function rename(a: CharacterAsset, label: string) {
    if (label === (a.label ?? "")) return;
    await createClient().from("character_assets").update({ label: label.slice(0, 80) || null }).eq("id", a.id);
    router.refresh();
  }

  const shown = filter === "all" ? assets : assets.filter((a) => a.kind === filter);
  const count = (k: AssetKind) => assets.filter((a) => a.kind === k).length;

  return (
    <div className="st-stack">
      <div className="ch-toolbar">
        <nav className="st-tabs" aria-label="Asset type">
          <button type="button" aria-current={filter === "all" ? "page" : undefined} onClick={() => setFilter("all")}>All <span className="st-count">{assets.length}</span></button>
          {ASSET_KINDS.map((k) => (
            <button key={k.key} type="button" aria-current={filter === k.key ? "page" : undefined} onClick={() => setFilter(k.key)}>
              {k.label} {count(k.key) > 0 && <span className="st-count">{count(k.key)}</span>}
            </button>
          ))}
        </nav>
        {canEdit && (
          <div className="ch-upload">
            <label htmlFor="as-kind" className="visually-hidden">Add as</label>
            <select id="as-kind" className="st-input" value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
              {ASSET_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <label className="btn st-small" htmlFor="as-files">{busy || "Upload images"}</label>
            <input id="as-files" className="visually-hidden" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFiles} disabled={!!busy} />
          </div>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {shown.length === 0 ? (
        <div className="hub-empty">
          <h2>{assets.length ? "Nothing in this group" : "No assets yet"}</h2>
          <p>Keep reference sheets, turnarounds, expressions and logos here, so everyone working on this character uses the same art.</p>
        </div>
      ) : (
        <ul className="ch-assets">
          {shown.map((a) => (
            <li key={a.id} className="ch-asset">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="ch-asset-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.label ?? "Character asset"} loading="lazy" />
              </a>
              <div className="ch-asset-meta">
                {canEdit ? (
                  <input className="ch-asset-label" defaultValue={a.label ?? ""} placeholder="Add a label" maxLength={80}
                    aria-label="Label" onBlur={(e) => rename(a, e.target.value.trim())} />
                ) : (
                  <b>{a.label || "Untitled"}</b>
                )}
                <span className="ch-asset-kind">{ASSET_KINDS.find((k) => k.key === a.kind)?.label}</span>
              </div>
              {canEdit && <button type="button" className="ch-asset-x" aria-label={`Remove ${a.label ?? "asset"}`} onClick={() => remove(a)}>×</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
