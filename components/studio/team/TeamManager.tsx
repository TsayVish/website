"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/studio/Avatar";
import { fmtDate } from "@/lib/hub";
import { createClient } from "@/lib/supabase/client";
import { ROLE_HELP, ROLE_LABEL, inviteUrl, type Workspace, type WorkspaceInvite, type WorkspaceMember, type WorkspaceRole } from "@/lib/workspaces";

type Person = { id: string; full_name: string | null; avatar_url: string | null };

/** One workspace: rename, members and roles, invite links. */
export function WorkspaceCard({
  workspace, members, invites, people, me, myRole, characterCount,
}: {
  workspace: Workspace; members: WorkspaceMember[]; invites: WorkspaceInvite[]; people: Person[];
  me: string; myRole: WorkspaceRole; characterCount: number;
}) {
  const router = useRouter();
  const owner = myRole === "owner";
  const [name, setName] = useState(workspace.name);
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const person = (id: string) => people.find((p) => p.id === id);
  const sb = () => createClient();

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError("");
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setLink("");
    setCopied(false);
    setBusy(true);
    setError("");
    const { data, error: err } = await sb().from("workspace_invites")
      .insert({ workspace_id: workspace.id, role, email: email.trim() || null }).select("token").single();
    setBusy(false);
    if (err || !data) return setError(err?.message ?? "Couldn’t create the invite.");
    setLink(inviteUrl(window.location.origin, (data as { token: string }).token));
    setEmail("");
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const pending = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());

  return (
    <section className="panel tm-card" aria-label={workspace.name}>
      <div className="tm-head">
        {owner ? (
          <form className="tm-name" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name !== workspace.name) run(() => sb().from("workspaces").update({ name: name.trim() }).eq("id", workspace.id)); }}>
            <label htmlFor={`ws-${workspace.id}`} className="visually-hidden">Workspace name</label>
            <input id={`ws-${workspace.id}`} className="tm-name-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            {name.trim() !== workspace.name && <button className="btn st-small" type="submit" disabled={busy}>Rename</button>}
          </form>
        ) : (
          <h2>{workspace.name}</h2>
        )}
        <span className="st-muted tm-meta">{members.length} member{members.length === 1 ? "" : "s"} · {characterCount} character{characterCount === 1 ? "" : "s"} · you’re {ROLE_LABEL[myRole].toLowerCase()}</span>
      </div>

      <ul className="tm-members">
        {members.map((m) => {
          const p = person(m.user_id);
          const nm = p?.full_name || "Member";
          return (
            <li key={m.user_id}>
              <Avatar url={p?.avatar_url} name={nm} size={32} />
              <span className="tm-who"><b>{nm}{m.user_id === me ? " (you)" : ""}</b><small>Joined {fmtDate(m.created_at)}</small></span>
              {owner && m.user_id !== me ? (
                <>
                  <label className="visually-hidden" htmlFor={`r-${m.user_id}`}>Role for {nm}</label>
                  <select id={`r-${m.user_id}`} className="st-input tm-role" value={m.role} disabled={busy}
                    onChange={(e) => run(() => sb().from("workspace_members").update({ role: e.target.value }).eq("workspace_id", workspace.id).eq("user_id", m.user_id))}>
                    {(["owner", "editor", "viewer"] as WorkspaceRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <button type="button" className="rp-link" disabled={busy}
                    onClick={() => run(() => sb().from("workspace_members").delete().eq("workspace_id", workspace.id).eq("user_id", m.user_id))}>Remove</button>
                </>
              ) : (
                <span className="tm-role-label" title={ROLE_HELP[m.role]}>{ROLE_LABEL[m.role]}</span>
              )}
            </li>
          );
        })}
      </ul>

      {owner && (
        <form className="tm-invite" onSubmit={invite}>
          <b className="st-panel-title">Invite someone</b>
          <div className="tm-invite-row">
            <label htmlFor={`ie-${workspace.id}`} className="visually-hidden">Email (optional)</label>
            <input id={`ie-${workspace.id}`} className="st-input" type="email" placeholder="Email (optional, locks the link to them)" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor={`ir-${workspace.id}`} className="visually-hidden">Role</label>
            <select id={`ir-${workspace.id}`} className="st-input tm-role" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="btn st-small" type="submit" disabled={busy}>Create invite link</button>
          </div>
          {link && (
            <div className="tm-link">
              <code>{link}</code>
              <button type="button" className="btn ghost st-small" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
            </div>
          )}
          <small className="st-help">Send the link yourself. It works once and expires in 14 days.</small>
          {pending.length > 0 && (
            <ul className="tm-pending">
              {pending.map((i) => (
                <li key={i.id}>
                  <span>{i.email || "Anyone with the link"} · {ROLE_LABEL[i.role]} · expires {fmtDate(i.expires_at)}</span>
                  <button type="button" className="rp-link" onClick={() => run(() => sb().from("workspace_invites").delete().eq("id", i.id))}>Revoke</button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="tm-foot">
        {!owner && (
          <button type="button" className="rp-link" onClick={() => run(() => sb().from("workspace_members").delete().eq("workspace_id", workspace.id).eq("user_id", me))}>Leave workspace</button>
        )}
        {owner && (confirmDelete ? (
          <span className="rp-inline">
            <span>Delete {workspace.name}? Its characters go back to the people who created them.</span>
            <button type="button" className="rp-link rp-danger" onClick={() => run(() => sb().from("workspaces").delete().eq("id", workspace.id))}>Delete</button>
            <button type="button" className="rp-link" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="rp-link rp-danger" onClick={() => setConfirmDelete(true)}>Delete workspace</button>
        ))}
      </div>
    </section>
  );
}

export function CreateWorkspace() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give it a name.");
    setBusy(true);
    setError("");
    const { error: err } = await createClient().from("workspaces").insert({ name: name.trim() });
    setBusy(false);
    if (err) return setError(err.message);
    setName("");
    router.refresh();
  }
  return (
    <form className="panel tm-create" onSubmit={submit}>
      <b className="st-panel-title">New workspace</b>
      <p className="st-muted">For a studio, agency or team that manages characters together.</p>
      <div className="tm-invite-row">
        <label htmlFor="ws-new" className="visually-hidden">Workspace name</label>
        <input id="ws-new" className="st-input" placeholder="e.g. Snack Studio" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn st-small" type="submit" disabled={busy}>{busy ? "Creating…" : "Create workspace"}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
