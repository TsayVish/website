"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { StaffMember } from "@/lib/admin";
import { createClient } from "@/lib/supabase/client";

type RpcResult = { error: { message: string } | null };

function useRpc() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  async function call(fn: string, args: Record<string, unknown>, success = "Saved.") {
    setBusy(true);
    setError("");
    setOk("");
    const { error: err } = (await createClient().rpc(fn, args)) as RpcResult;
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    setOk(success);
    router.refresh();
    return true;
  }
  return { busy, error, ok, call };
}

/** Status, assignee, due date and private notes for one requested service. */
export function ServiceTicketForm({
  projectId, service, status, assignee, due, note, staff,
}: {
  projectId: string; service: string; status: string; assignee: string | null; due: string | null; note: string | null; staff: StaffMember[];
}) {
  const { busy, error, ok, call } = useRpc();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await call("admin_update_service", {
      p_project: projectId, p_service: service, p_status: String(d.get("status")),
      p_assignee: String(d.get("assignee") || "") || null, p_due: String(d.get("due") || "") || null, p_note: String(d.get("note") || ""),
    });
  }
  return (
    <form className="panel adm-form" onSubmit={submit}>
      <b className="st-panel-title">Ticket</b>
      <div className="st-fields">
        <div className="field">
          <label htmlFor="t-status">Status</label>
          <select id="t-status" name="status" className="st-input" defaultValue={status}>
            <option value="requested">Requested (waiting)</option>
            <option value="active">Active (set up)</option>
            <option value="off">Off</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-assignee">Assignee</label>
          <select id="t-assignee" name="assignee" className="st-input" defaultValue={assignee ?? ""}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-due">Due</label>
          <input id="t-due" name="due" type="date" className="st-input" defaultValue={due ?? ""} />
        </div>
        <div className="field st-wide">
          <label htmlFor="t-note">Internal note <span className="opt-hint">(staff only)</span></label>
          <textarea id="t-note" name="note" className="st-input" rows={3} maxLength={4000} defaultValue={note ?? ""} />
        </div>
      </div>
      <p className="st-help">Marking it active notifies the creator.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {ok && <p className="form-ok" role="status">{ok}</p>}
      <div className="st-actions"><button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save ticket"}</button></div>
    </form>
  );
}

/** Post an update the creator sees on the service tab (and gets notified about). */
export function PostServiceUpdate({ projectId, service }: { projectId: string; service: string }) {
  const { busy, error, call } = useRpc();
  const [body, setBody] = useState("");
  return (
    <form className="adm-update" onSubmit={async (e) => {
      e.preventDefault();
      if (!body.trim()) return;
      if (await call("admin_post_service_update", { p_project: projectId, p_service: service, p_body: body })) setBody("");
    }}>
      <label htmlFor="su-body" className="visually-hidden">Update for the creator</label>
      <textarea id="su-body" className="st-input" rows={3} maxLength={4000} value={body} placeholder="e.g. We filed your trademark in classes 25 and 28. Expect the first USPTO response in about 3 months."
        onChange={(e) => setBody(e.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="st-actions"><button className="btn st-small" type="submit" disabled={busy || !body.trim()}>{busy ? "Posting…" : "Post update to creator"}</button></div>
    </form>
  );
}

export function PartnershipStatusForm({ projectId, status }: { projectId: string; status: string }) {
  const { busy, error, ok, call } = useRpc();
  return (
    <form className="adm-inline-form" onSubmit={async (e) => {
      e.preventDefault();
      const d = new FormData(e.currentTarget);
      await call("admin_set_partnership_status", { p_project: projectId, p_status: String(d.get("status")), p_message: String(d.get("message") || "") }, "Updated and the requester was notified.");
    }}>
      <select name="status" className="st-input" defaultValue={status} aria-label="Status">
        <option value="submitted">Submitted</option>
        <option value="in_review">In review</option>
        <option value="approved">Approved</option>
        <option value="declined">Declined</option>
      </select>
      <input name="message" className="st-input" maxLength={300} placeholder="Message to the requester (optional)" aria-label="Message" />
      <button className="btn st-small" type="submit" disabled={busy}>{busy ? "Saving…" : "Update"}</button>
      {error && <small className="form-error">{error}</small>}
      {ok && <small className="form-ok">{ok}</small>}
    </form>
  );
}

export function ReportAdminActions({ reportId, status, targetType, targetId, ownerId }: { reportId: string; status: string; targetType: string; targetId: string; ownerId: string | null }) {
  const { busy, error, call } = useRpc();
  const [banning, setBanning] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <span className="hub-row-actions">
      {status === "open" ? (
        <>
          <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => call("admin_set_report", { p_report: reportId, p_status: "resolved" })}>Resolve</button>
          <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => call("admin_set_report", { p_report: reportId, p_status: "dismissed" })}>Dismiss</button>
        </>
      ) : (
        <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => call("admin_set_report", { p_report: reportId, p_status: "open" })}>Reopen</button>
      )}
      {(targetType === "listing" || targetType === "post") && (
        <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => call("admin_hide_content", { p_type: targetType, p_id: targetId }, "Hidden.")}>Hide {targetType}</button>
      )}
      {ownerId && (banning ? (
        <span className="rp-inline">
          <input className="st-input" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Ban reason" />
          <button type="button" className="btn st-small hub-danger-text" disabled={busy} onClick={() => call("admin_ban", { p_user: ownerId, p_reason: reason }, "Banned.")}>Ban</button>
          <button type="button" className="rp-link" onClick={() => setBanning(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="rp-link rp-danger" onClick={() => setBanning(true)}>Ban owner</button>
      ))}
      {error && <small className="form-error">{error}</small>}
    </span>
  );
}

export function BanToggle({ userId, banned }: { userId: string; banned: boolean }) {
  const { busy, error, call } = useRpc();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  if (banned) return (
    <span className="hub-row-actions">
      <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => call("admin_unban", { p_user: userId }, "Unbanned.")}>Unban</button>
      {error && <small className="form-error">{error}</small>}
    </span>
  );
  return (
    <span className="hub-row-actions">
      {asking ? (
        <>
          <input className="st-input" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Ban reason" />
          <button type="button" className="btn st-small" disabled={busy} onClick={() => call("admin_ban", { p_user: userId, p_reason: reason }, "Banned.")}>Ban</button>
          <button type="button" className="rp-link" onClick={() => setAsking(false)}>Cancel</button>
        </>
      ) : (
        <button type="button" className="rp-link rp-danger" onClick={() => setAsking(true)}>Ban</button>
      )}
      {error && <small className="form-error">{error}</small>}
    </span>
  );
}

/** Sets how much AI Studio generation (provider cost) someone can use a month. */
export function StudioLimit({ userId }: { userId: string }) {
  const { busy, error, ok, call } = useRpc();
  const [open, setOpen] = useState(false);
  const [dollars, setDollars] = useState("");
  if (!open) return <button type="button" className="rp-link" title="Optional monthly cap on AI Studio provider cost" onClick={() => setOpen(true)}>Spend cap</button>;
  return (
    <span className="hub-row-actions">
      <input className="st-input adm-limit" inputMode="decimal" placeholder="$ a month" value={dollars} onChange={(e) => setDollars(e.target.value)} aria-label="Monthly AI Studio limit in dollars" />
      <button type="button" className="btn st-small" disabled={busy || !/^\d+(\.\d{1,2})?$/.test(dollars.trim())}
        onClick={async () => { if (await call("admin_set_studio_limit", { p_user: userId, p_cents: Math.round(Number(dollars) * 100) }, "Limit saved.")) setOpen(false); }}>
        Save
      </button>
      <button type="button" className="rp-link" onClick={() => setOpen(false)}>Cancel</button>
      {error && <small className="form-error">{error}</small>}
      {ok && <small>{ok}</small>}
    </span>
  );
}

/** Adds or removes someone's AI Studio credits, with a note for the audit log. */
export function CreditsAdjust({ userId }: { userId: string }) {
  const { busy, error, ok, call } = useRpc();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const valid = /^-?\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) !== 0 && note.trim().length > 0;
  if (!open) return <button type="button" className="rp-link" onClick={() => setOpen(true)}>Credits</button>;
  return (
    <span className="hub-row-actions adm-credits">
      <input className="st-input adm-limit" inputMode="decimal" placeholder="$ (− to remove)" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Credits to add in dollars" />
      <input className="st-input adm-note" placeholder="Why" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <button type="button" className="btn st-small" disabled={busy || !valid}
        onClick={async () => { if (await call("admin_adjust_credits", { p_user: userId, p_cents: Math.round(Number(amount) * 100), p_note: note.trim() }, "Credits updated.")) { setOpen(false); setAmount(""); setNote(""); } }}>
        Save
      </button>
      <button type="button" className="rp-link" onClick={() => setOpen(false)}>Cancel</button>
      {error && <small className="form-error">{error}</small>}
      {ok && <small>{ok}</small>}
    </span>
  );
}
