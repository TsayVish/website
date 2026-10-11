"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DetailsFields, cleanDetails } from "./DetailsFields";
import { createClient } from "@/lib/supabase/client";
import type { ServiceDef } from "@/lib/services";
import type { Details, ServiceStatus } from "@/lib/types";

const LABEL: Record<ServiceStatus, string> = { off: "Off", requested: "Requested", active: "Active" };

/** One service tab: its status and the details our team needs to set it up. */
export function ServiceForm({
  projectId, def, initialStatus, initialDetails, updatedAt,
}: {
  projectId: string;
  def: ServiceDef;
  initialStatus: ServiceStatus;
  initialDetails: Details;
  updatedAt?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ServiceStatus>(initialStatus);
  const [values, setValues] = useState<Details>(initialDetails);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "status" | "save">("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function write(nextStatus: ServiceStatus, details: Details) {
    const { error } = await createClient()
      .from("project_services")
      .upsert({ project_id: projectId, service: def.name, status: nextStatus, details }, { onConflict: "project_id,service" });
    return error?.message ?? "";
  }

  async function toggleStatus() {
    if (status === "active") return;
    const next: ServiceStatus = status === "off" ? "requested" : "off";
    setBusy("status");
    setMsg(null);
    const err = await write(next, cleanDetails(values));
    setBusy("");
    if (err) return setMsg({ kind: "err", text: `Couldn’t update: ${err}` });
    setStatus(next);
    setDirty(false);
    setMsg({ kind: "ok", text: next === "requested" ? "Requested. Our team will pick it up." : "Turned off." });
    router.refresh();
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    const err = await write(status, cleanDetails(values));
    setBusy("");
    if (err) return setMsg({ kind: "err", text: `Couldn’t save: ${err}` });
    setDirty(false);
    setMsg({ kind: "ok", text: "Details saved." });
    router.refresh();
  }

  const updated = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="st-tabpanel">
      <div className="panel st-svc-head">
        <div className="st-svc-title">
          <h2>{def.name} <span className={`st-status ${status}`}>{LABEL[status]}</span></h2>
          <p className="st-muted">{def.summary}</p>
          {updated && <small className="st-help">Last updated {updated}</small>}
        </div>
        {status === "active" ? (
          <p className="st-help st-svc-locked">Set up and running. Contact us to change or stop it.</p>
        ) : (
          <button type="button" className={status === "off" ? "btn" : "btn ghost"} onClick={toggleStatus} disabled={busy !== ""}>
            {busy === "status" ? "Updating…" : status === "off" ? "Request this service" : "Turn off"}
          </button>
        )}
      </div>

      <form className="panel" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h3>Details</h3>
        <DetailsFields
          fields={def.fields} values={values} idPrefix={def.slug}
          onChange={(k, v) => { setValues((p) => ({ ...p, [k]: v })); setDirty(true); setMsg(null); }}
        />
        {msg && <p className={msg.kind === "err" ? "form-error" : "form-ok"} role="status">{msg.text}</p>}
        <div className="launch">
          <button className="btn" type="submit" disabled={busy !== "" || !dirty}>{busy === "save" ? "Saving…" : "Save details"}</button>
          {status === "off" && <small>You can fill this in before requesting the service.</small>}
        </div>
      </form>
    </div>
  );
}
