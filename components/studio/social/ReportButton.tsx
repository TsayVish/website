"use client";

import { useState, type FormEvent } from "react";
import { REPORT_REASONS, type ReportTarget } from "@/lib/hub";
import { createClient } from "@/lib/supabase/client";

/** A quiet "Report" link that opens a short form. Reports go to the creator (anonymously) and to the tsayvish team. */
export function ReportButton({ targetType, targetId, targetLabel, label = "Report" }: { targetType: ReportTarget; targetId: string; targetLabel?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const reason = String(d.get("reason") ?? "");
    if (!reason) return setError("Pick a reason.");
    setBusy(true);
    setError("");
    const { error: err } = await createClient().from("reports").insert({
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel?.slice(0, 200) || null,
      reason,
      details: String(d.get("details") ?? "").trim().slice(0, 1000) || null,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setDone(true);
  }

  if (done) return <p className="form-ok rp-done" role="status">Thanks. We’ve sent your report for review.</p>;
  if (!open)
    return (
      <button type="button" className="rp-link" onClick={() => setOpen(true)}>{label}</button>
    );

  const id = `rp-${targetType}-${targetId}`;
  return (
    <form className="panel rp-form" onSubmit={submit} noValidate>
      <fieldset>
        <legend className="st-panel-title">What’s wrong?</legend>
        <div className="rp-reasons">
          {REPORT_REASONS.map((r) => (
            <label key={r} className="rp-reason">
              <input type="radio" name="reason" value={r} /> {r}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-d`}>Anything else? <span className="opt-hint">(optional)</span></label>
        <textarea className="st-input" id={`${id}-d`} name="details" rows={3} maxLength={1000} />
      </div>
      <p className="st-help">The creator sees the reason but not who reported it.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="st-actions">
        <button className="btn st-small" type="submit" disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
        <button className="btn ghost st-small" type="button" onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
      </div>
    </form>
  );
}
