"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/studio/Avatar";
import { useRpc } from "@/components/studio/admin/AdminActions";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL, type Org, type OrgInvite, type OrgMember, type OrgRole } from "@/lib/orgs";

/** One org: its people, pending invites, and (for owners and admins in it) the controls. */
export function OrgManager({
  org, members, invites, me, canManage, isOwner, base,
}: {
  org: Org; members: OrgMember[]; invites: OrgInvite[]; me: string; canManage: boolean; isOwner: boolean; base: string;
}) {
  const router = useRouter();
  const { busy, error, ok, call } = useRpc();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [name, setName] = useState(org.name);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");
  const owners = members.filter((m) => m.role === "owner").length;

  async function add(e: FormEvent) {
    e.preventDefault();
    const list = [...new Set(email.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
    if (!list.length) return;
    setAdding(true);
    setNote("");
    let added = 0, invited = 0;
    const failed: string[] = [];
    for (const addr of list) {
      const { data, error: err } = await createClient().rpc("org_add_member", { p_org: org.id, p_email: addr, p_role: role });
      if (err) failed.push(`${addr}: ${err.message}`);
      else if (data === "invited") invited++;
      else added++;
    }
    setAdding(false);
    setEmail(failed.map((f) => f.split(":")[0]).join(", "));
    setNote([
      added ? `Added ${added} ${added === 1 ? "person" : "people"}.` : "",
      invited ? `Invited ${invited}; they’ll join when they sign up with that email.` : "",
      failed.length ? `Couldn’t add ${failed.join("; ")}` : "",
    ].filter(Boolean).join(" "));
    router.refresh();
  }

  async function leaveOrDelete(kind: "leave" | "delete") {
    const sure = kind === "delete"
      ? window.confirm(`Delete “${org.name}”? Everyone in it stays, but admins in it lose access to the others.`)
      : window.confirm(`Leave “${org.name}”?`);
    if (!sure) return;
    const done = kind === "delete" ? await call("delete_org", { p_org: org.id }, "Deleted.") : await call("org_remove_member", { p_org: org.id, p_user: me }, "You left.");
    if (done) router.push(base);
  }

  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div>
          <Link href={base} className="org-back">← Orgs</Link>
          {renaming ? (
            <form className="org-rename" onSubmit={async (e) => { e.preventDefault(); if (await call("rename_org", { p_org: org.id, p_name: name.trim() }, "Renamed.")) setRenaming(false); }}>
              <input className="st-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Org name" autoFocus />
              <button className="btn st-small" type="submit" disabled={busy || !name.trim()}>Save</button>
              <button className="btn ghost st-small" type="button" onClick={() => { setName(org.name); setRenaming(false); }}>Cancel</button>
            </form>
          ) : <h1>{org.name}</h1>}
          <p className="st-sub">{members.length} {members.length === 1 ? "person" : "people"}. Admins in this org can see and help with everyone in it; nobody outside can.</p>
        </div>
        {canManage && !renaming && <div className="st-actions"><button type="button" className="btn ghost st-small" onClick={() => setRenaming(true)}>Rename</button></div>}
      </div>

      {canManage && (
        <form className="panel org-add" onSubmit={add}>
          <b className="st-panel-title">Add people</b>
          <div className="org-add-row">
            <label className="field adm-grow"><span className="lbl">Emails</span>
              <input className="st-input" type="text" inputMode="email" placeholder="name@example.com, another@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="field"><span className="lbl">Role</span>
              <select className="st-input" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
                <option value="member">Member</option>
                <option value="owner">Owner (can manage people)</option>
              </select></label>
            <button className="btn" type="submit" disabled={adding || !email.trim()}>{adding ? "Adding…" : "Add"}</button>
          </div>
          <p className="st-help">Separate several emails with commas. People without an account get an invite and join automatically when they sign up with that email.</p>
          {note && <p className="form-ok" role="status">{note}</p>}
        </form>
      )}

      {(error || ok) && <p className={error ? "form-error" : "form-ok"} role="status">{error || ok}</p>}

      <div className="st-table org-members">
        <div className="st-row st-row-head org-mrow" aria-hidden="true"><span>Person</span><span>Role</span><span /></div>
        {members.map((m) => {
          const lastOwner = m.role === "owner" && owners === 1;
          return (
            <div key={m.user_id} className="st-row org-mrow">
              <span className="org-who">
                <Avatar url={null} name={m.full_name || m.email || "?"} size={30} />
                <span>
                  <Link href={`/studio/u/${m.user_id}`}><b>{m.full_name || "No name"}</b></Link>
                  {m.user_id === me && <span className="adm-you">You</span>}
                  {m.is_staff && <span className="st-status active">Admin</span>}
                  {m.email && <small>{m.email}</small>}
                </span>
              </span>
              <span className="org-role">
                {canManage ? (
                  <select className="st-input st-small" value={m.role} disabled={busy || lastOwner} aria-label={`Role for ${m.full_name || m.email}`}
                    title={lastOwner ? "An org needs at least one owner" : undefined}
                    onChange={(e) => call("org_set_role", { p_org: org.id, p_user: m.user_id, p_role: e.target.value }, "Role updated.")}>
                    <option value="owner">Owner</option>
                    <option value="member">Member</option>
                  </select>
                ) : <span className="st-cell">{ROLE_LABEL[m.role]}</span>}
              </span>
              <span className="org-act">
                {m.user_id === me ? (
                  !lastOwner && <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => leaveOrDelete("leave")}>Leave</button>
                ) : canManage && !lastOwner && (
                  <button type="button" className="btn ghost st-small adm-danger" disabled={busy}
                    onClick={() => { if (window.confirm(`Remove ${m.full_name || m.email || "this person"} from ${org.name}?`)) call("org_remove_member", { p_org: org.id, p_user: m.user_id }, "Removed."); }}>
                    Remove
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {canManage && invites.length > 0 && (
        <section className="st-stack org-invites">
          <h2 className="org-h2">Waiting to sign up</h2>
          <div className="st-table">
            {invites.map((i) => (
              <div key={i.id} className="st-row org-mrow">
                <span className="org-who"><span><b>{i.email}</b><small>Joins as {ROLE_LABEL[i.role].toLowerCase()} when they sign up</small></span></span>
                <span />
                <span className="org-act"><button type="button" className="btn ghost st-small" disabled={busy} onClick={() => call("org_cancel_invite", { p_invite: i.id }, "Invite cancelled.")}>Cancel invite</button></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {isOwner && (
        <div className="panel st-danger-panel">
          <div><b>Delete this org</b><p>People keep their accounts and work. Admins in it lose access to the others.</p></div>
          <button type="button" className="btn ghost st-small adm-danger" disabled={busy} onClick={() => leaveOrDelete("delete")}>Delete org</button>
        </div>
      )}
    </div>
  );
}
