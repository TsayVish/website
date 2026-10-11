"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { Avatar } from "@/components/studio/Avatar";
import { createClient } from "@/lib/supabase/client";
import { checkImage, uploadImage } from "@/lib/upload";
import { TOPICS } from "@/lib/topics";

const PATHS = [
  { key: "build", title: "Build my own characters", text: "Create or upload characters, then switch on trademarks, storefront and more.", next: "/studio/hub/characters/new" },
  { key: "hire", title: "Find characters or talent", text: "License characters, or hire illustrators, voice actors and makers.", next: "/studio" },
  { key: "partner", title: "Partner with the tsayvish cast", text: "Brand deals, licensing and products with our in-house characters.", next: "/studio/new/partner" },
] as const;

/** First-run welcome: profile basics, what they're here for, and topics they care about. */
export function Onboarding({ initialName, initialAvatar, me }: { initialName: string; initialAvatar: string | null; me: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [avatar, setAvatar] = useState<string | null>(initialAvatar);
  const [path, setPath] = useState<(typeof PATHS)[number]["key"]>("build");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const problem = checkImage(f, "avatars");
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      setAvatar(await uploadImage("avatars", f));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  async function finish(skip = false) {
    setBusy(true);
    setError("");
    const fields: Record<string, unknown> = { onboarded_at: new Date().toISOString() };
    if (!skip) {
      if (name.trim()) fields.full_name = name.trim().slice(0, 80);
      if (bio.trim()) fields.bio = bio.trim().slice(0, 500);
      if (location.trim()) fields.location = location.trim().slice(0, 80);
      if (avatar) fields.avatar_url = avatar;
      fields.interests = interests.slice(0, 12);
      fields.goal = path === "partner" ? "partner" : "build";
    }
    const { error: err } = await createClient().from("profiles").update(fields).eq("id", me);
    if (err) {
      setBusy(false);
      return setError(err.message);
    }
    router.push(skip ? "/studio" : PATHS.find((p) => p.key === path)!.next);
    router.refresh();
  }

  return (
    <div className="ob">
      <ol className="ob-steps" aria-label="Steps">
        {["About you", "What brings you here", "Your interests"].map((s, i) => (
          <li key={s} aria-current={step === i ? "step" : undefined} className={i < step ? "done" : ""}>{s}</li>
        ))}
      </ol>
      <div className="panel ob-card">
        {step === 0 && (
          <>
            <h1>Welcome to tsayvish</h1>
            <p className="st-muted">A few details so people know who they’re working with. You can change these any time in Settings.</p>
            <div className="ob-photo">
              <Avatar url={avatar} name={name || "?"} size={64} />
              <label className="btn ghost st-small" htmlFor="ob-photo">{avatar ? "Change photo" : "Add a photo"}</label>
              <input id="ob-photo" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhoto} />
            </div>
            <div className="field"><label htmlFor="ob-name">Name</label><input id="ob-name" className="st-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label htmlFor="ob-bio">What you make <span className="opt-hint">(optional)</span></label>
              <textarea id="ob-bio" className="st-input" rows={3} maxLength={500} value={bio} placeholder="Illustrator of soft, loud characters. 200k on TikTok." onChange={(e) => setBio(e.target.value)} /></div>
            <div className="field"><label htmlFor="ob-loc">Location <span className="opt-hint">(optional)</span></label>
              <input id="ob-loc" className="st-input" value={location} maxLength={80} placeholder="Brooklyn, NY" onChange={(e) => setLocation(e.target.value)} /></div>
          </>
        )}
        {step === 1 && (
          <>
            <h1>What brings you here?</h1>
            <p className="st-muted">This sets where you start. You can do all of these later.</p>
            <div className="ob-paths" role="radiogroup" aria-label="What brings you here">
              {PATHS.map((p) => (
                <button key={p.key} type="button" role="radio" aria-checked={path === p.key} className="ob-path" onClick={() => setPath(p.key)}>
                  <b>{p.title}</b><span>{p.text}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1>What are you into?</h1>
            <p className="st-muted">We’ll show these first on Discover. Pick as many as you like.</p>
            <div className="chips" role="group" aria-label="Interests">
              {TOPICS.map((t) => (
                <button key={t.name} type="button" className="chip" aria-pressed={interests.includes(t.name)}
                  onClick={() => setInterests((x) => (x.includes(t.name) ? x.filter((y) => y !== t.name) : [...x, t.name]))}>{t.name}</button>
              ))}
            </div>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="ob-actions">
          <button type="button" className="rp-link" onClick={() => finish(true)} disabled={busy}>Skip for now</button>
          <span className="st-actions">
            {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
            {step < 2 ? (
              <button type="button" className="btn" onClick={() => setStep(step + 1)} disabled={busy || (step === 0 && !name.trim())}>Continue</button>
            ) : (
              <button type="button" className="btn" onClick={() => finish()} disabled={busy}>{busy ? "Saving…" : "Get started"}</button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
