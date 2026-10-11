"use client";

import Link from "next/link";
import { useState } from "react";
import { CharacterArt, type CharacterKind } from "./art";
import { COLORS, INFRA, KINDS, MOODS } from "@/lib/content";

export function Builder() {
  const [name, setName] = useState("Mango");
  const [desc, setDesc] = useState("");
  const [kind, setKind] = useState<CharacterKind>("Person");
  const [colorIdx, setColorIdx] = useState(0);
  const [moodName, setMoodName] = useState("Dreamy");
  const [infra, setInfra] = useState(() => INFRA.map((i) => i.on));

  const mood = MOODS.find((m) => m.name === moodName) ?? MOODS[0];
  const color = COLORS[colorIdx].value;
  const displayName = name.trim() || "Your character";
  const bio = desc.trim() ? `${desc.trim().replace(/[.!?]+$/, "")}. ${mood.line}` : mood.line;
  const onCount = infra.filter(Boolean).length;

  return (
    <section id="build" className="flush-top" aria-labelledby="build-title">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Build your own</span>
          <h2 id="build-title">Make a character. Switch on what it needs to grow.</h2>
          <p className="lede">
            A virtual influencer, a monster, a robot, a talking cupcake. Make any kind of character or persona, give it a
            personality, then choose the infrastructure behind it. Start small and turn more on as your audience grows.
          </p>
        </div>

        <div className="builder">
          <div className="panel" aria-label="Character options">
            <div className="field">
              <label htmlFor="bName">Name</label>
              <input type="text" id="bName" value={name} maxLength={16} autoComplete="off" onChange={(e) => setName(e.target.value)} />
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
                type="text" id="bDesc" value={desc} maxLength={90} autoComplete="off"
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

            <div className="launch">
              {/* TODO: carry the builder choices into sign-up once accounts are connected. */}
              <Link className="btn" href="/login?mode=signup">Create this character</Link>
              <small>Preview only. Sign up to save it.</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
