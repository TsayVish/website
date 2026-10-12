"use client";

import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/billing";
import { useRpc } from "./AdminActions";

export type Member = {
  id: string;
  email: string;
  full_name: string | null;
  joined: string;
  banned: boolean;
  staff_role: string | null;
  free: boolean;
  balance: number;
  cap: number | null;
};

type Panel = null | "credits" | "cap" | "ban";

/** One member in Admin → Members, with billing switch, balance and actions. */
export function MemberRow({ m, isMe }: { m: Member; isMe: boolean }) {
  const { busy, error, ok, call } = useRpc();
  const [panel, setPanel] = useState<Panel>(null);
  const [free, setFree] = useState(m.free);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [cap, setCap] = useState(m.cap != null ? (m.cap / 100).toFixed(2) : "");
  const [reason, setReason] = useState("");

  const dollars = (v: string) => /^-?\d+(\.\d{1,2})?$/.test(v.trim());
  const open = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  async function toggleBilling() {
    const next = !free;
    setFree(next);
    const done = await call("admin_set_billing_exempt", { p_user: m.id, p_exempt: next, p_note: null }, next ? "Billing turned off." : "Billing turned on.");
    if (!done) setFree(!next);
  }

  return (
    <div className={`st-row adm-member${panel ? " is-open" : ""}`}>
      <span className="adm-m-who">
        <Link href={`/studio/u/${m.id}`}><b>{m.full_name || "No name"}</b></Link>
        {isMe && <span className="adm-you">You</span>}
        <small>{m.email}</small>
      </span>
      <span className="st-cell adm-m-joined">{m.joined}</span>
      <span className="adm-m-status">
        {m.staff_role ? <span className="st-status active">Staff</span> : m.banned ? <span className="st-status off">Banned</span> : <span className="st-status">Member</span>}
      </span>
      <span className="adm-m-billing">
        <button type="button" role="switch" aria-checked={!free} className="adm-switch" onClick={toggleBilling} disabled={busy}
          aria-label={`AI Studio billing for ${m.full_name || m.email}`}>
          <span className="adm-switch-track"><span className="adm-switch-dot" /></span>
          <span className="adm-switch-text">{free ? "Free" : "Charged"}</span>
        </button>
      </span>
      <span className="adm-m-credits">
        <b>{money(m.balance)}</b>
        {m.cap != null && <small>cap {money(m.cap)}/mo</small>}
      </span>
      <span className="adm-m-actions">
        <button type="button" className="btn ghost st-small" aria-expanded={panel === "credits"} onClick={() => open("credits")}>Credits</button>
        <button type="button" className="btn ghost st-small" aria-expanded={panel === "cap"} onClick={() => open("cap")}>Spend cap</button>
        {!m.staff_role && (m.banned ? (
          <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => call("admin_unban", { p_user: m.id }, "Unbanned.")}>Unban</button>
        ) : (
          <button type="button" className="btn ghost st-small adm-danger" aria-expanded={panel === "ban"} onClick={() => open("ban")}>Ban</button>
        ))}
      </span>

      {panel === "credits" && (
        <div className="adm-m-panel">
          <div className="adm-m-fields">
            <label className="field"><span className="lbl">Amount ($)</span>
              <input className="st-input" inputMode="decimal" placeholder="5.00 or -2.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="field adm-grow"><span className="lbl">Note</span>
              <input className="st-input" placeholder="Why (shows in their history)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          <div className="adm-m-buttons">
            <button type="button" className="btn st-small" disabled={busy || !dollars(amount) || Number(amount) === 0 || !note.trim()}
              onClick={async () => { if (await call("admin_adjust_credits", { p_user: m.id, p_cents: Math.round(Number(amount) * 100), p_note: note.trim() }, "Credits updated.")) { setAmount(""); setNote(""); setPanel(null); } }}>
              {Number(amount) < 0 ? "Remove credits" : "Add credits"}
            </button>
            <button type="button" className="btn ghost st-small" onClick={() => setPanel(null)}>Cancel</button>
          </div>
        </div>
      )}

      {panel === "cap" && (
        <div className="adm-m-panel">
          <p className="ai-hint">Optional safety limit on what this member’s AI Studio jobs can cost you in a month, charged or free.</p>
          <div className="adm-m-fields">
            <label className="field"><span className="lbl">Monthly cap ($)</span>
              <input className="st-input" inputMode="decimal" placeholder="25.00" value={cap} onChange={(e) => setCap(e.target.value)} /></label>
          </div>
          <div className="adm-m-buttons">
            <button type="button" className="btn st-small" disabled={busy || !dollars(cap) || Number(cap) < 0}
              onClick={async () => { if (await call("admin_set_studio_limit", { p_user: m.id, p_cents: Math.round(Number(cap) * 100) }, "Cap saved.")) setPanel(null); }}>Save cap</button>
            {m.cap != null && <button type="button" className="btn ghost st-small" disabled={busy}
              onClick={async () => { if (await call("admin_clear_studio_limit", { p_user: m.id }, "Cap removed.")) setPanel(null); }}>Remove cap</button>}
            <button type="button" className="btn ghost st-small" onClick={() => setPanel(null)}>Cancel</button>
          </div>
        </div>
      )}

      {panel === "ban" && (
        <div className="adm-m-panel">
          <p className="ai-hint">Banning hides their listings and stops them posting, listing, offering, messaging and generating.</p>
          <div className="adm-m-fields">
            <label className="field adm-grow"><span className="lbl">Reason</span>
              <input className="st-input" placeholder="Shown in the audit log" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          </div>
          <div className="adm-m-buttons">
            <button type="button" className="btn st-small adm-danger-fill" disabled={busy}
              onClick={async () => { if (await call("admin_ban", { p_user: m.id, p_reason: reason }, "Banned.")) setPanel(null); }}>Ban member</button>
            <button type="button" className="btn ghost st-small" onClick={() => setPanel(null)}>Cancel</button>
          </div>
        </div>
      )}

      {(error || ok) && <p className={`adm-m-msg ${error ? "form-error" : ""}`} role="status">{error || ok}</p>}
    </div>
  );
}
