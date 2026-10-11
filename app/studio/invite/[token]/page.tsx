import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInvite } from "@/components/studio/team/AcceptInvite";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HELP, ROLE_LABEL, type WorkspaceRole } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Workspace invite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { invite_token: token });
  const invite = ((data ?? []) as { workspace_name: string; role: WorkspaceRole; invited_by: string; expired: boolean; used: boolean }[])[0];

  return (
    <div className="st-stack iv">
      <div className="panel iv-card">
        {!invite ? (
          <>
            <h1>This invite link isn’t valid</h1>
            <p className="st-muted">Check you copied the whole link, or ask for a new one.</p>
            <Link className="btn ghost" href="/studio">Go to Studio</Link>
          </>
        ) : invite.used || invite.expired ? (
          <>
            <h1>{invite.used ? "This invite has already been used" : "This invite has expired"}</h1>
            <p className="st-muted">Ask {invite.invited_by} for a new link to {invite.workspace_name}.</p>
            <Link className="btn ghost" href="/studio">Go to Studio</Link>
          </>
        ) : (
          <>
            <p className="iv-eyebrow">Workspace invite</p>
            <h1>Join {invite.workspace_name}</h1>
            <p className="st-muted">{invite.invited_by} invited you as {ROLE_LABEL[invite.role].toLowerCase()}. {ROLE_HELP[invite.role]}.</p>
            <AcceptInvite token={token} />
          </>
        )}
      </div>
    </div>
  );
}
