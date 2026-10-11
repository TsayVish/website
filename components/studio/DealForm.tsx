"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DetailsFields, cleanDetails } from "./DetailsFields";
import { createClient } from "@/lib/supabase/client";
import { DEAL_FIELDS } from "@/lib/services";
import type { Details } from "@/lib/types";

/** Partnership "Deal terms" tab, saved to projects.details. */
export function DealForm({ projectId, initialDetails }: { projectId: string; initialDetails: Details }) {
  const router = useRouter();
  const [values, setValues] = useState<Details>(initialDetails);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().from("projects").update({ details: cleanDetails(values) }).eq("id", projectId);
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: `Couldn’t save: ${error.message}` });
    setDirty(false);
    setMsg({ kind: "ok", text: "Deal terms saved." });
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div>
        <h2>Deal terms</h2>
        <p className="st-muted">The more we know, the faster we can come back with a proposal.</p>
      </div>
      <DetailsFields
        fields={DEAL_FIELDS} values={values} idPrefix="deal"
        onChange={(k, v) => { setValues((p) => ({ ...p, [k]: v })); setDirty(true); setMsg(null); }}
      />
      {msg && <p className={msg.kind === "err" ? "form-error" : "form-ok"} role="status">{msg.text}</p>}
      <div className="launch">
        <button className="btn" type="submit" disabled={busy || !dirty}>{busy ? "Saving…" : "Save deal terms"}</button>
      </div>
    </form>
  );
}
