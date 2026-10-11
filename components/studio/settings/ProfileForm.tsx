"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Avatar } from "../Avatar";
import { createClient } from "@/lib/supabase/client";
import { checkImage, uploadImage, uploadRules } from "@/lib/upload";

export type ProfileValues = {
  full_name: string;
  bio: string;
  location: string;
  website: string;
  avatar_url: string | null;
  goal: "build" | "partner";
  discoverable: boolean;
};

export function ProfileForm({ userId, initial }: { userId: string; initial: ProfileValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initial.avatar_url);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const set = (k: keyof ProfileValues, value: string | null) => { setV((p) => ({ ...p, [k]: value })); setMsg(null); };

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const problem = checkImage(f, "avatars");
    if (problem) { setMsg({ kind: "err", text: problem }); e.target.value = ""; return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setMsg(null);
  }

  function removePhoto() {
    setFile(null);
    setPreview(null);
    set("avatar_url", null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const website = v.website.trim();
    if (website && !/^https?:\/\/\S+\.\S+/.test(website)) {
      return setMsg({ kind: "err", text: "Enter your website as a full address, starting with https://" });
    }
    setBusy(true);
    setMsg(null);
    try {
      let avatarUrl = v.avatar_url;
      if (file) avatarUrl = await uploadImage("avatars", file);
      const { error } = await createClient()
        .from("profiles")
        .update({
          full_name: v.full_name.trim() || null,
          bio: v.bio.trim() || null,
          location: v.location.trim() || null,
          website: website || null,
          avatar_url: avatarUrl,
          goal: v.goal,
          discoverable: v.discoverable,
        })
        .eq("id", userId);
      if (error) throw new Error(error.message);
      setFile(null);
      setV((p) => ({ ...p, avatar_url: avatarUrl }));
      setMsg({ kind: "ok", text: "Profile saved." });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: `Couldn’t save: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" id="profile" onSubmit={onSubmit} noValidate>
      <div className="st-set-head">
        <h2>Profile</h2>
        <p className="st-muted">Shown on your profile, your Marketplace listings and in Messages.</p>
      </div>

      <div className="st-photo">
        <Avatar url={preview} name={v.full_name || "?"} size={72} />
        <div className="st-photo-actions">
          <label className="btn ghost st-small" htmlFor="pr-photo">{preview ? "Change photo" : "Upload photo"}</label>
          <input id="pr-photo" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} />
          {preview && <button type="button" className="st-linkbtn" onClick={removePhoto}>Remove</button>}
          <small className="st-help">{file ? file.name : uploadRules("avatars").label}</small>
        </div>
      </div>

      <div className="st-fields">
        <div className="field">
          <label htmlFor="pr-name">Name</label>
          <input className="st-input" id="pr-name" maxLength={80} autoComplete="name" value={v.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pr-loc">Location <span className="opt-hint">(optional)</span></label>
          <input className="st-input" id="pr-loc" maxLength={80} placeholder="Brooklyn, NY" value={v.location} onChange={(e) => set("location", e.target.value)} />
        </div>
        <div className="field st-wide">
          <label htmlFor="pr-bio">Bio <span className="opt-hint">(optional)</span></label>
          <textarea className="st-input" id="pr-bio" rows={4} maxLength={500} placeholder="What you make, who you make it for." value={v.bio} onChange={(e) => set("bio", e.target.value)} />
          <small className="st-help">{v.bio.length}/500</small>
        </div>
        <div className="field st-wide">
          <label htmlFor="pr-web">Website <span className="opt-hint">(optional)</span></label>
          <input className="st-input" id="pr-web" type="url" maxLength={200} placeholder="https://" value={v.website} onChange={(e) => set("website", e.target.value)} />
        </div>
        <label className="toggle st-wide st-discover-toggle" htmlFor="pr-discover">
          <span className="t">
            <b>Show me in Discover</b>
            <small>Other members can find your profile in Discover and Search. People you’re already chatting with can always see it.</small>
          </span>
          <input type="checkbox" id="pr-discover" checked={v.discoverable} onChange={(e) => { setV((p) => ({ ...p, discoverable: e.target.checked })); setMsg(null); }} />
        </label>
        <div className="field st-wide">
          <span className="lbl" id="pr-goal">Show first in my Studio</span>
          <div className="chips" role="group" aria-labelledby="pr-goal">
            <button type="button" className="chip" aria-pressed={v.goal === "build"} onClick={() => setV((p) => ({ ...p, goal: "build" }))}>Create an original</button>
            <button type="button" className="chip" aria-pressed={v.goal === "partner"} onClick={() => setV((p) => ({ ...p, goal: "partner" }))}>Partner with tsayvish</button>
          </div>
        </div>
      </div>

      {msg && <p className={msg.kind === "err" ? "form-error" : "form-ok"} role="status">{msg.text}</p>}
      <div className="launch">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      </div>
    </form>
  );
}
