"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { aiWrite, usageNote } from "@/lib/ai/client";
import type { BibleResult } from "@/lib/ai/tasks";
import { HEX, type StyleGuide } from "@/lib/characters";
import { createClient } from "@/lib/supabase/client";

/** The character bible (bio, backstory, traits, world) and brand rules (palette, voice, catchphrases, do's and don'ts, usage). */
export function StyleGuideForm({ projectId, initial, canEdit }: { projectId: string; initial: StyleGuide; canEdit: boolean }) {
  const router = useRouter();
  const [bio, setBio] = useState(initial.bio ?? "");
  const [backstory, setBackstory] = useState(initial.backstory ?? "");
  const [traits, setTraits] = useState(initial.traits ?? "");
  const [world, setWorld] = useState(initial.world ?? "");
  const [notes, setNotes] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [palette, setPalette] = useState<string[]>(initial.palette?.length ? initial.palette : []);
  const [voice, setVoice] = useState(initial.voice ?? "");
  const [phrases, setPhrases] = useState((initial.catchphrases ?? []).join("\n"));
  const [dos, setDos] = useState(initial.dos ?? "");
  const [donts, setDonts] = useState(initial.donts ?? "");
  const [usage, setUsage] = useState(initial.usage ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const guide: StyleGuide = {
      bio: bio.trim().slice(0, 500) || undefined,
      backstory: backstory.trim().slice(0, 2000) || undefined,
      traits: traits.trim().slice(0, 2000) || undefined,
      world: world.trim().slice(0, 2000) || undefined,
      palette: palette.filter((c) => HEX.test(c)).slice(0, 8),
      voice: voice.trim().slice(0, 2000) || undefined,
      catchphrases: phrases.split("\n").map((p) => p.trim()).filter(Boolean).slice(0, 12),
      dos: dos.trim().slice(0, 2000) || undefined,
      donts: donts.trim().slice(0, 2000) || undefined,
      usage: usage.trim().slice(0, 2000) || undefined,
    };
    const { error } = await createClient().from("projects").update({ style_guide: guide }).eq("id", projectId);
    setBusy(false);
    setMsg(error ? { ok: false, text: `Couldn’t save: ${error.message}` } : { ok: true, text: "Saved." });
    if (!error) router.refresh();
  }

  const area = (id: string, label: string, value: string, set: (v: string) => void, hint: string, rows = 3) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea className="st-input" id={id} rows={rows} value={value} placeholder={hint} disabled={!canEdit}
        onChange={(e) => { set(e.target.value); setMsg(null); }} />
    </div>
  );

  async function writeWithAI() {
    if ([bio, backstory, traits, world, voice, phrases, dos, donts].some((x) => x.trim()) && !window.confirm("Replace what’s in these fields with a new draft? Nothing is saved until you press Save.")) return;
    setAiBusy(true);
    setMsg(null);
    try {
      const { result: b, usage } = await aiWrite<BibleResult>("bible", projectId, { notes });
      setBio(b.bio); setBackstory(b.backstory); setTraits(b.traits); setWorld(b.world);
      if (b.voice) setVoice(b.voice);
      if (b.catchphrases.length) setPhrases(b.catchphrases.join("\n"));
      if (b.dos) setDos(b.dos);
      if (b.donts) setDonts(b.donts);
      setMsg({ ok: true, text: `Draft written. ${usageNote(usage)}. Review it, then save.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
    setAiBusy(false);
  }

  return (
    <div className="panel ch-guide">
      <div className="ch-bible-head">
        <b className="st-panel-title">Character bible</b>
        <p className="ai-hint">Every AI tool (captions, ideas, plans, scripts) writes from this, so the more specific, the better.</p>
      </div>
      {canEdit && (
        <div className="ch-bible-ai">
          <input className="st-input" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for the AI: “works at a startup, secretly loves gardening”…" aria-label="Notes for the AI" />
          <button type="button" className="btn ghost st-small" onClick={writeWithAI} disabled={aiBusy}>{aiBusy ? "Writing…" : "✦ Write with AI"}</button>
        </div>
      )}
      {area("sg-bio", "Bio", bio, setBio, "One or two lines: who they are.", 2)}
      {area("sg-back", "Backstory", backstory, setBackstory, "Where they came from and what they want.", 4)}
      <div className="st-fields">
        {area("sg-traits", "Traits and quirks", traits, setTraits, "Habits, likes, dislikes, fears…")}
        {area("sg-world", "World and recurring cast", world, setWorld, "Where they live, friends, rivals, recurring places…")}
      </div>
      <b className="st-panel-title ch-brand-title">Brand and voice</b>
      <div className="field">
        <span className="lbl" id="sg-pal">Palette</span>
        <div className="ch-palette" role="group" aria-labelledby="sg-pal">
          {palette.map((c, i) => (
            <span key={i} className="ch-swatch">
              <input type="color" value={HEX.test(c) ? c : "#000000"} disabled={!canEdit} aria-label={`Color ${i + 1}`}
                onChange={(e) => setPalette((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
              <code>{c.toUpperCase()}</code>
              {canEdit && <button type="button" aria-label={`Remove ${c}`} onClick={() => setPalette((p) => p.filter((_, j) => j !== i))}>×</button>}
            </span>
          ))}
          {canEdit && palette.length < 8 && (
            <button type="button" className="btn ghost st-small" onClick={() => setPalette((p) => [...p, "#7c83ff"])}>Add color</button>
          )}
          {!palette.length && !canEdit && <span className="st-muted">No palette yet.</span>}
        </div>
      </div>
      {area("sg-voice", "Voice and tone", voice, setVoice, "How they talk: words they use, words they never would, energy level…", 4)}
      {area("sg-phrases", "Catchphrases (one per line)", phrases, setPhrases, "“I’ll start Monday.”", 3)}
      <div className="st-fields">
        {area("sg-dos", "Do", dos, setDos, "Always shown with their sprinkles…")}
        {area("sg-donts", "Don’t", donts, setDonts, "Never shown eating other baked goods…")}
      </div>
      {area("sg-usage", "Usage and licensing notes", usage, setUsage, "Approval needed for merch, minimum size for the logo…")}
      {msg && <p className={msg.ok ? "form-ok" : "form-error"} role="status">{msg.text}</p>}
      {canEdit && <div className="st-actions"><button className="btn" type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>}
    </div>
  );
}
