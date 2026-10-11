"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { CharacterPicture } from "@/components/art";
import { COLORS, INFRA } from "@/lib/content";
import { AUDIENCE_SIZES, IP_STATUSES, RIGHTS, cleanLinks, type ExistingDetails } from "@/lib/existing";
import { createClient } from "@/lib/supabase/client";
import { checkImage, uploadCharacterImage } from "@/lib/upload";

export type ExistingInitial = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  image_url: string | null;
  details: ExistingDetails;
};

/** Bring a character that already exists (on social, in a book, on shelves) onto tsayvish. */
export function UploadCharacterForm({ initial, afterSave, workspaceId }: { initial?: ExistingInitial; afterSave?: string; workspaceId?: string | null }) {
  const router = useRouter();
  const editing = Boolean(initial);
  const d = initial?.details;
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [colorIdx, setColorIdx] = useState(() => Math.max(0, COLORS.findIndex((c) => c.name === initial?.color)));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.image_url ?? null);
  const [links, setLinks] = useState((d?.links ?? []).join("\n"));
  const [since, setSince] = useState(d?.since ?? "");
  const [audience, setAudience] = useState(d?.audience ?? "");
  const [ipStatus, setIpStatus] = useState(d?.ip_status ?? "");
  const [rights, setRights] = useState(d?.rights ?? "");
  const [confirmed, setConfirmed] = useState(editing);
  const [infra, setInfra] = useState(() => INFRA.map((i) => i.on));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const touch = () => setSaved(false);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const problem = checkImage(f);
    e.target.value = "";
    if (problem) return setError(problem);
    setError("");
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    touch();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const finalName = name.trim();
    if (!finalName) return setError("Add your character’s name.");
    if (!file && !initial?.image_url) return setError("Upload a picture of your character.");
    if (since && !/^(19|20)\d\d$/.test(since)) return setError("Enter the year as four digits, like 2021.");
    if (!rights) return setError("Tell us who owns the rights.");
    if (!confirmed) return setError("Confirm you have the rights to bring this character here.");
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const imageUrl = file ? await uploadCharacterImage(file) : initial!.image_url;
      const details: ExistingDetails = {
        origin: "existing",
        links: cleanLinks(links),
        audience: audience || undefined,
        ip_status: ipStatus || undefined,
        rights,
        since: since || undefined,
      };
      const fields = {
        name: finalName, kind: "Custom", color: COLORS[colorIdx].name, personality: null,
        description: desc.trim() || null, image_url: imageUrl, details,
      };
      if (editing && initial) {
        const { error: err } = await supabase.from("projects").update(fields).eq("id", initial.id);
        if (err) throw new Error(err.message);
        setFile(null);
        setSaved(true);
        setBusy(false);
        router.refresh();
        return;
      }
      const { data, error: err } = await supabase.from("projects").insert({ type: "original", ...fields, workspace_id: workspaceId || null }).select("id").single();
      if (err || !data) throw new Error(err?.message ?? "No project was returned.");
      const id = (data as { id: string }).id;
      const services = INFRA.filter((_, i) => infra[i]).map((item) => ({ project_id: id, service: item.name, status: "requested" }));
      if (services.length) {
        const { error: svcErr } = await supabase.from("project_services").insert(services);
        if (svcErr) throw new Error(svcErr.message);
      }
      router.push(afterSave ?? `/studio/p/${id}`);
      router.refresh();
    } catch (err) {
      setError(`Couldn’t save: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  const color = COLORS[colorIdx].value;
  const chipGroup = (label: string, id: string, options: readonly string[], value: string, set: (v: string) => void, optional = true) => (
    <div className="field">
      <span className="lbl" id={id}>{label} {optional && <span className="opt-hint">(optional)</span>}</span>
      <div className="chips" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => { set(value === o && optional ? "" : o); touch(); }}>{o}</button>
        ))}
      </div>
    </div>
  );

  return (
    <form className={editing ? "builder builder-edit" : "builder"} onSubmit={submit} noValidate>
      <div className="panel">
        <div className="field">
          <label htmlFor="ex-name">Character name</label>
          <input type="text" id="ex-name" value={name} maxLength={60} autoComplete="off" placeholder="e.g. Captain Crumb" onChange={(e) => { setName(e.target.value); touch(); }} />
        </div>
        <div className="field">
          <label htmlFor="ex-file">Picture</label>
          <label className="upload" htmlFor="ex-file">
            <span className="upload-btn">{previewUrl ? "Replace picture" : "Choose a picture"}</span>
            <span className="upload-hint">{file ? file.name : "Your official art. PNG, JPG, WebP or GIF, up to 5 MB"}</span>
          </label>
          <input id="ex-file" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} />
        </div>
        <div className="field">
          <label htmlFor="ex-desc">Who they are <span className="opt-hint">(optional)</span></label>
          <input type="text" id="ex-desc" value={desc} maxLength={200} autoComplete="off" placeholder="A grumpy pirate cookie with 400k TikTok followers" onChange={(e) => { setDesc(e.target.value); touch(); }} />
        </div>
        <div className="field">
          <label htmlFor="ex-links">Where they live today <span className="opt-hint">(optional, up to 5 links)</span></label>
          <textarea className="st-input" id="ex-links" rows={3} value={links} placeholder={"tiktok.com/@captaincrumb\ninstagram.com/captaincrumb"} onChange={(e) => { setLinks(e.target.value); touch(); }} />
        </div>
        <div className="st-fields">
          <div className="field">
            <label htmlFor="ex-since">First published <span className="opt-hint">(year)</span></label>
            <input className="st-input" id="ex-since" inputMode="numeric" maxLength={4} placeholder="2021" value={since} onChange={(e) => { setSince(e.target.value.replace(/\D/g, "")); touch(); }} />
          </div>
          <div className="field">
            <label htmlFor="ex-aud">Audience size <span className="opt-hint">(optional)</span></label>
            <select className="st-input" id="ex-aud" value={audience} onChange={(e) => { setAudience(e.target.value); touch(); }}>
              <option value="">Choose…</option>
              {AUDIENCE_SIZES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>
        {chipGroup("Who owns the rights?", "ex-rights", RIGHTS, rights, setRights, false)}
        {chipGroup("Trademark and copyright", "ex-ip", IP_STATUSES, ipStatus, setIpStatus)}
        <div className="field">
          <span className="lbl" id="ex-color">Background color</span>
          <div className="swatches" role="group" aria-labelledby="ex-color">
            {COLORS.map((c, i) => (
              <button key={c.name} type="button" className="swatch" aria-label={c.name} aria-pressed={colorIdx === i} style={{ background: c.value }} onClick={() => { setColorIdx(i); touch(); }} />
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="preview">
          <div className="pic" style={{ background: `color-mix(in srgb, ${color} 40%, var(--surface))` }}>
            <CharacterPicture name={name.trim() || "Your character"} kind="Custom" color={color} prop="sparkle" sleepy={false} imageUrl={previewUrl} />
          </div>
          <div className="meta">
            <span className="species">Existing character{since ? ` · since ${since}` : ""}</span>
            <h3>{name.trim() || "Your character"}</h3>
            {desc.trim() ? <p>{desc.trim()}</p> : <p className="bio-empty">No description yet.</p>}
          </div>
        </div>

        {!editing && (
          <div className="infra">
            <div className="infra-head">
              <b>What do you need?</b>
              <span>{infra.filter(Boolean).length} of {INFRA.length} on</span>
            </div>
            <div>
              {INFRA.map((item, i) => (
                <label className="toggle" htmlFor={`exinf${i}`} key={item.name}>
                  <span className="t"><b>{item.name}</b><small>{item.detail}</small></span>
                  <input type="checkbox" id={`exinf${i}`} checked={infra[i]} onChange={() => setInfra((prev) => prev.map((v, j) => (j === i ? !v : v)))} />
                </label>
              ))}
            </div>
          </div>
        )}

        {!editing && (
          <label className="ex-confirm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I own this character or have permission to manage it, and the picture is mine to use.</span>
          </label>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="form-ok" role="status">Changes saved.</p>}
        <div className="launch">
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add character"}</button>
          {!editing && <small>Services you switch on go to our team as requests.</small>}
        </div>
      </div>
    </form>
  );
}
