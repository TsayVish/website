"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function AccountForm({ email, initialName, initialGoal }: { email: string; initialName: string; initialGoal: "build" | "partner" }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [goal, setGoal] = useState(initialGoal);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return setMsg({ kind: "err", text: "You’ve been logged out. Log in again to save changes." });
    }
    const { error } = await supabase.from("profiles").update({ full_name: name.trim() || null, goal }).eq("id", user.id);
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: `Couldn’t save: ${error.message}` });
    setMsg({ kind: "ok", text: "Saved." });
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="ac-name">Name</label>
        <input className="st-input" id="ac-name" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <span className="lbl">Email</span>
        <p className="st-plain">{email}</p>
      </div>
      <div className="field">
        <span className="lbl" id="lblGoal">Show first on my Studio</span>
        <div className="chips" role="group" aria-labelledby="lblGoal">
          <button type="button" className="chip" aria-pressed={goal === "build"} onClick={() => setGoal("build")}>Create an original</button>
          <button type="button" className="chip" aria-pressed={goal === "partner"} onClick={() => setGoal("partner")}>Partner with tsayvish</button>
        </div>
      </div>
      {msg && <p className={msg.kind === "err" ? "form-error" : "st-ok"} role="status">{msg.text}</p>}
      <div className="launch">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  );
}
