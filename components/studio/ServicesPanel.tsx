"use client";

import { useState } from "react";
import { INFRA } from "@/lib/content";
import { createClient } from "@/lib/supabase/client";
import type { ServiceStatus } from "@/lib/types";

const LABEL: Record<ServiceStatus, string> = { off: "Off", requested: "Requested", active: "Active" };

/** Switch services on (sends a request to the team) or off. Active services are locked. */
export function ServicesPanel({ projectId, initial }: { projectId: string; initial: Record<string, ServiceStatus> }) {
  const [statuses, setStatuses] = useState<Record<string, ServiceStatus>>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle(service: string) {
    const current = statuses[service] ?? "off";
    if (current === "active") return;
    const next: ServiceStatus = current === "off" ? "requested" : "off";
    setSaving(service);
    setError("");
    setStatuses((s) => ({ ...s, [service]: next }));
    const { error: err } = await createClient()
      .from("project_services")
      .upsert(
        { project_id: projectId, service, status: next, updated_at: new Date().toISOString() },
        { onConflict: "project_id,service" },
      );
    if (err) {
      setStatuses((s) => ({ ...s, [service]: current }));
      setError(`Couldn’t update ${service}: ${err.message}`);
    }
    setSaving(null);
  }

  const onCount = Object.values(statuses).filter((s) => s !== "off").length;

  return (
    <div className="panel">
      <div className="infra-head">
        <b>Infrastructure</b>
        <span>{onCount} of {INFRA.length} on</span>
      </div>
      <div>
        {INFRA.map((item, i) => {
          const status = statuses[item.name] ?? "off";
          return (
            <label className="toggle" htmlFor={`svc${i}`} key={item.name}>
              <span className="t">
                <b>
                  {item.name} <span className={`st-status ${status}`}>{LABEL[status]}</span>
                </b>
                <small>{status === "active" ? "Set up and running. Contact us to change it." : item.detail}</small>
              </span>
              <input
                type="checkbox" id={`svc${i}`} checked={status !== "off"}
                disabled={status === "active" || saving === item.name}
                onChange={() => toggle(item.name)}
              />
            </label>
          );
        })}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
