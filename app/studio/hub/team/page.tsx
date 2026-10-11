import type { Metadata } from "next";
import { EmptyState } from "@/components/studio/hub/EmptyState";
import { IconPeople } from "@/components/studio/icons";
import { CreateWorkspace, WorkspaceCard } from "@/components/studio/team/TeamManager";
import { createClient } from "@/lib/supabase/server";
import type { Workspace, WorkspaceInvite, WorkspaceMember } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user!.id;
  const { data: ws, error } = await supabase.from("workspaces").select("id, name, created_by, created_at").order("created_at");
  const workspaces = (ws ?? []) as Workspace[];
  const ids = workspaces.map((w) => w.id);
  const [{ data: mem }, { data: inv }, { data: proj }] = await Promise.all([
    ids.length ? supabase.from("workspace_members").select("workspace_id, user_id, role, created_at").in("workspace_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("workspace_invites").select("id, workspace_id, token, role, email, created_at, expires_at, accepted_at").in("workspace_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("projects").select("workspace_id").in("workspace_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const members = (mem ?? []) as WorkspaceMember[];
  const invites = (inv ?? []) as WorkspaceInvite[];
  const projects = (proj ?? []) as { workspace_id: string }[];
  const peopleIds = [...new Set(members.map((m) => m.user_id))];
  const { data: ppl } = peopleIds.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", peopleIds) : { data: [] };
  const people = (ppl ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[];

  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Team</h1><p className="st-sub">Workspaces let several people manage the same characters, with owner, editor and viewer roles.</p></div></div>
      {error && <p className="form-error" role="alert">Couldn’t load workspaces: {error.message}. Run the latest supabase/schema.sql.</p>}
      {workspaces.length === 0 && !error && (
        <EmptyState icon={<IconPeople />} title="No workspaces yet">
          Create one for your studio or agency, invite your team, then move characters into it from their Character tab or when you create them.
        </EmptyState>
      )}
      {workspaces.map((w) => {
        const wm = members.filter((m) => m.workspace_id === w.id);
        const myRole = wm.find((m) => m.user_id === me)?.role ?? "viewer";
        return (
          <WorkspaceCard key={w.id} workspace={w} members={wm} invites={invites.filter((i) => i.workspace_id === w.id)}
            people={people} me={me} myRole={myRole} characterCount={projects.filter((p) => p.workspace_id === w.id).length} />
        );
      })}
      <CreateWorkspace />
    </div>
  );
}
