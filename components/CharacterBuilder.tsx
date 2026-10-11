"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CharacterArt, type CharacterKind } from "./art";
import { COLORS, INFRA, KINDS, MOODS } from "@/lib/content";
import { createClient } from "@/lib/supabase/client";

/**
 * The character builder.
 * - mode "preview" (home page): nothing is saved; the button leads to sign-up.
 * - mode "save" (Studio): "Create project" saves the character and its requested services.
 */
export function CharacterBuilder({ mode }: { mode: "preview" | "save" }) {
  const router = useRouter();
  const [name, setName] = useState(mode === "preview" ? "Mango" : "");
  const [desc, setDesc] = useState("");
  const [kind, setKind] = useState<CharacterKind>("Person");
  const [colorIdx, setColorIdx] = useState(0);
  const [moodName, setMoodName] = useState("Dreamy");
  const [infra, setInfra] = useState(() => INFRA.map((i) => i.on));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mood = MOODS.find((m) => m.name === moodName) ?? MOODS[0];
  const color = COLORS[colorIdx].value;
  const displayName = name.trim() || "Your character";
  const bio = desc.trim() ? `${desc.trim().replace(/[.!?]+$/, "")}. ${mood.line}` : mood.line;
  const onCount = infra.filter(Boolean).length;

  async function save() {
    const finalName = name.trim();
    if (!finalName) {
      setError("Give your character a name first.");
      document.getElementById("bName")?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("projects")
        .insert({
          type: "original",
          name: finalName,
          kind,
          color: COLORS[colorIdx].name,
          personality: mood.name,
          description: desc.trim() || null,
        })
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
    <div className="builder">
      <div className="panel" aria-label="Character options">
        <div className="field">
          <label htmlFor="bName">Name</label>
          <input
            type="text" id="bName" value={name} maxLength={24} autoComplete="off"
            placeholder={mode === "save" ? "Mango" : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <span className="lbl" id="lblKind">Kind of character</span>
          <div className="chips" role="group" aria-labelledby="lblKind">
            {KINDS.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="bDesc">
            Describe it <span className="opt-hint">(optional)</span>
          </label>
          <input
            type="text" id="bDesc" value={desc} maxLength={mode === "save" ? 200 : 90} autoComplete="off"
            placeholder="A retired pop star who now runs a bakery"
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>

        <div className="field">
          <span className="lbl" id="lblColor">Color</span>
          <div className="swatches" role="group" aria-labelledby="lblColor">
            {COLORS.map((c, i) => (
              <button
                key={c.name} type="button" className="swatch" aria-label={c.name}
                aria-pressed={colorIdx === i} style={{ background: c.value }}
                onClick={() => setColorIdx(i)}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="lbl" id="lblMood">Personality</span>
          <div className="chips" role="group" aria-labelledby="lblMood">
            {MOODS.map((m) => (
              <button key={m.name} type="button" className="chip" aria-pressed={moodName === m.name} onClick={() => setMoodName(m.name)}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="preview">
          <div className="pic" style={{ background: `color-mix(in srgb, ${color} 40%, var(--surface))` }}>
            <CharacterArt name={displayName} kind={kind} color={color} prop={mood.prop} sleepy={mood.sleepy} />
          </div>
          <div className="meta">
            <span className="species">{mood.name} · {kind}</span>
            <h3>{displayName}</h3>
            <p>{bio}</p>
          </div>
        </div>

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

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="launch">
          {mode === "preview" ? (
            <>
              <Link className="btn" href="/login?mode=signup">Create this character</Link>
              <small>Preview only. Sign up to save it.</small>
            </>
          ) : (
            <>
              <button className="btn" type="button" onClick={save} disabled={busy}>
                {busy ? "Creating…" : "Create project"}
              </button>
              <small>Services you switch on are sent to our team as requests.</small>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
