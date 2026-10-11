"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CastArt } from "@/components/CastArt";
import { CAST, PARTNER_INTERESTS, type PartnerInterest } from "@/lib/content";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/types";

/** Start a partnership request, or (with `initial`) edit one. */
export function PartnerForm({ initial }: { initial?: Project }) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [picked, setPicked] = useState<string[]>(initial?.cast_members ?? []);
  const [interest, setInterest] = useState<PartnerInterest>(initial?.interest ?? "Brand partnership");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggle(name: string) {
    setSaved(false);
    setPicked((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const company = String(d.get("company") ?? "").trim();
    const message = String(d.get("message") ?? "").trim();
    let projectName = String(d.get("projectName") ?? "").trim();
    if (!company) return setError("Enter your company or brand name.");
    if (picked.length === 0) return setError("Pick at least one character you’d like to work with.");
    if (!projectName) projectName = `${picked.join(" & ")} × ${company}`.slice(0, 60);
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const supabase = createClient();
      const fields = { name: projectName, company, interest, cast_members: picked, message: message || null };
      if (editing && initial) {
        const { error: err } = await supabase.from("projects").update(fields).eq("id", initial.id);
        if (err) throw new Error(err.message);
        setSaved(true);
        setBusy(false);
        router.refresh();
        return;
      }
      const { data, error: err } = await supabase
        .from("projects")
        .insert({ type: "partnership", status: "submitted", ...fields })
        .select("id")
        .single();
      if (err || !data) throw new Error(err?.message ?? "No project was returned.");
      router.push(`/studio/p/${(data as { id: string }).id}?tab=deal`);
      router.refresh();
    } catch (err) {
      setError(`Couldn’t ${editing ? "save" : "send"} your request: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <form className="st-form" onSubmit={onSubmit} onChange={() => setSaved(false)} noValidate>
      <div className="panel">
        <div className="field">
          <span className="lbl" id="lblCast">Which characters? <span className="opt-hint">(pick one or more)</span></span>
          <div className="st-castpick" role="group" aria-labelledby="lblCast">
            {CAST.map((c) => (
              <button
                key={c.name} type="button" className="st-castopt" aria-pressed={picked.includes(c.name)}
                onClick={() => toggle(c.name)}
              >
                <span className="st-castopt-pic cast-pic">
                  <CastArt member={c} />
                </span>
                <span className="st-castopt-text">
                  <b>{c.name}</b>
                  <small>{c.species}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="lbl" id="lblInterest">What kind of partnership?</span>
          <div className="chips" role="group" aria-labelledby="lblInterest">
            {PARTNER_INTERESTS.map((i) => (
              <button key={i} type="button" className="chip" aria-pressed={interest === i} onClick={() => { setInterest(i); setSaved(false); }}>
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="field">
          <label htmlFor="pf-company">Company or brand</label>
          <input className="st-input" id="pf-company" name="company" maxLength={120} autoComplete="organization" defaultValue={initial?.company ?? ""} required />
        </div>
        <div className="field">
          <label htmlFor="pf-name">Project name <span className="opt-hint">(optional)</span></label>
          <input className="st-input" id="pf-name" name="projectName" maxLength={60} placeholder="e.g. Burnout Bunny plush for spring" defaultValue={initial?.name ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="pf-message">Tell us about it <span className="opt-hint">(optional)</span></label>
          <textarea className="st-input" id="pf-message" name="message" rows={6} maxLength={2000} placeholder="Timing, markets, product ideas, budget range…" defaultValue={initial?.message ?? ""} />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="form-ok" role="status">Changes saved.</p>}
        <div className="launch">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? (editing ? "Saving…" : "Sending…") : editing ? "Save changes" : "Send partnership request"}
          </button>
          {!editing && <small>Next, you can add deal terms like territories and budget.</small>}
        </div>
      </div>
    </form>
  );
}
