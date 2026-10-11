"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { CharacterPicture, type CharacterKind } from "./art";
import { COLORS, INFRA, KINDS, MOODS, kindLabel } from "@/lib/content";
import { createClient } from "@/lib/supabase/client";
import { checkImage, uploadCharacterImage } from "@/lib/upload";

export type BuilderInitial = {
  id: string;
  name: string;
  kind: CharacterKind;
  color: string; // color name, e.g. "Mint"
  personality: string;
  description: string | null;
  image_url: string | null;
};

/**
 * The character builder.
 * - "preview" (home page): nothing is saved; the button leads to sign-up.
 * - "save" (Studio): "Create project" saves the character and its requested services.
 * - "edit" (project's Character tab): updates an existing character.
 */
export function CharacterBuilder({ mode, initial }: { mode: "preview" | "save" | "edit"; initial?: BuilderInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? (mode === "preview" ? "Mango" : ""));
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<CharacterKind>(initial?.kind ?? "Person");
  const [colorIdx, setColorIdx] = useState(() => Math.max(0, COLORS.findIndex((c) => c.name === initial?.color)));
  const [moodName, setMoodName] = useState(initial?.personality ?? "Dreamy");
  const [infra, setInfra] = useState(() => INFRA.map((i) => i.on));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.image_url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Free the temporary preview URL when it's replaced or the builder closes.
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const mood = MOODS.find((m) => m.name === moodName) ?? MOODS[0];
  const color = COLORS[colorIdx].value;
  const displayName = name.trim() || "Your character";
  // Show only what the person wrote. The home-page demo shows a sample line until they type.
  const bio = desc.trim() || (mode === "preview" ? mood.line : "");
  const onCount = infra.filter(Boolean).length;
  const showInfra = mode !== "edit";

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const problem = checkImage(f);
    if (problem) {
      setError(problem);
      e.target.value = "";
      return;
    }
    setError("");
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setSaved(false);
  }

  async function submit() {
    const finalName = name.trim();
    if (!finalName) {
      setError("Give your character a name first.");
      document.getElementById("bName")?.focus();
      return;
    }
    if (kind === "Custom" && !file && !initial?.image_url) {
      setError("Upload a picture for your custom character.");
      return;
    }
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const supabase = createClient();
      let imageUrl: string | null = kind === "Custom" ? initial?.image_url ?? null : null;
      if (kind === "Custom" && file) imageUrl = await uploadCharacterImage(file);

      const fields = {
        name: finalName,
        kind,
        color: COLORS[colorIdx].name,
        personality: mood.name,
        description: desc.trim() || null,
        image_url: imageUrl,
      };

      if (mode === "edit" && initial) {
        const { error: err } = await supabase.from("projects").update(fields).eq("id", initial.id);
        if (err) throw new Error(err.message);
        setFile(null);
        setSaved(true);
        setBusy(false);
        router.refresh();
        return;
      }

      const { data, error: err } = await supabase
        .from("projects")
        .insert({ type: "original", ...fields })
        .select("id")
        .single();
      if (err || !data) throw new Error(err?.message ?? "No project was returned.");

      const projectId = (data as { id: string }).id;
      const services = INFRA.filter((_, i) => infra[i]).map((item) => ({
        project_id: projectId,
        service: item.name,
        status: "requested",
      }));
      if (services.length) {
        const { error: svcErr } = await supabase.from("project_services").insert(services);
        if (svcErr) throw new Error(svcErr.message);
      }
      router.push(`/studio/p/${projectId}`);
      router.refresh();
    } catch (err) {
      setError(`Couldn’t save your character: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <div className={showInfra ? "builder" : "builder builder-edit"}>
      <div className="panel" aria-label="Character options">
        <div className="field">
          <label htmlFor="bName">Name</label>
          <input
            type="text" id="bName" value={name} maxLength={40} autoComplete="off"
            placeholder={mode === "preview" ? undefined : "Mango"}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
          />
        </div>

        <div className="field">
          <span className="lbl" id="lblKind">Kind of character</span>
          <div className="chips" role="group" aria-labelledby="lblKind">
            {KINDS.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => { setKind(k); setSaved(false); }}>
                {kindLabel(k)}
              </button>
            ))}
          </div>
        </div>

        {kind === "Custom" && (
          <div className="field">
            <label htmlFor="bFile">Picture</label>
            <label className="upload" htmlFor="bFile">
              <span className="upload-btn">{previewUrl ? "Replace picture" : "Choose a picture"}</span>
              <span className="upload-hint">{file ? file.name : "PNG, JPG, WebP or GIF, up to 5 MB"}</span>
            </label>
            <input id="bFile" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} />
            {mode === "preview" && <small className="upload-hint">Shown here only. Sign up to save it.</small>}
          </div>
        )}

        <div className="field">
          <label htmlFor="bDesc">
            Describe it <span className="opt-hint">(optional)</span>
          </label>
          <input
            type="text" id="bDesc" value={desc} maxLength={mode === "preview" ? 90 : 200} autoComplete="off"
            placeholder="A retired pop star who now runs a bakery"
            onChange={(e) => { setDesc(e.target.value); setSaved(false); }}
          />
        </div>

        <div className="field">
          <span className="lbl" id="lblColor">{kind === "Custom" ? "Background color" : "Color"}</span>
          <div className="swatches" role="group" aria-labelledby="lblColor">
            {COLORS.map((c, i) => (
              <button
                key={c.name} type="button" className="swatch" aria-label={c.name}
                aria-pressed={colorIdx === i} style={{ background: c.value }}
                onClick={() => { setColorIdx(i); setSaved(false); }}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="lbl" id="lblMood">Personality</span>
          <div className="chips" role="group" aria-labelledby="lblMood">
            {MOODS.map((m) => (
              <button key={m.name} type="button" className="chip" aria-pressed={moodName === m.name} onClick={() => { setMoodName(m.name); setSaved(false); }}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="preview">
          <div className="pic" style={{ background: `color-mix(in srgb, ${color} 40%, var(--surface))` }}>
            <CharacterPicture name={displayName} kind={kind} color={color} prop={mood.prop} sleepy={mood.sleepy} imageUrl={previewUrl} />
          </div>
          <div className="meta">
            <span className="species">{mood.name} · {kindLabel(kind)}</span>
            <h3>{displayName}</h3>
            {bio ? <p>{bio}</p> : <p className="bio-empty">No description yet.</p>}
          </div>
        </div>

        {showInfra && (
          <div className="infra">
            <div className="infra-head">
              <b>Infrastructure</b>
              <span>{onCount} of {INFRA.length} on</span>
            </div>
            <div>
              {INFRA.map((item, i) => (
                <label className="toggle" htmlFor={`inf${i}`} key={item.name}>
                  <span className="t">
                    <b>{item.name}</b>
                    <small>{item.detail}</small>
                  </span>
                  <input
                    type="checkbox" id={`inf${i}`} checked={infra[i]}
                    onChange={() => setInfra((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="form-ok" role="status">Changes saved.</p>}

        <div className="launch">
          {mode === "preview" ? (
            <>
              <Link className="btn" href="/login?mode=signup">Create this character</Link>
              <small>Preview only. Sign up to save it.</small>
            </>
          ) : mode === "save" ? (
            <>
              <button className="btn" type="button" onClick={submit} disabled={busy}>
                {busy ? "Creating…" : "Create project"}
              </button>
              <small>Services you switch on are sent to our team as requests.</small>
            </>
          ) : (
            <button className="btn" type="button" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
