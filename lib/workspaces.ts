export type WorkspaceRole = "owner" | "editor" | "viewer";
export type Workspace = { id: string; name: string; created_by: string; created_at: string };
export type WorkspaceMember = { workspace_id: string; user_id: string; role: WorkspaceRole; created_at: string };
export type WorkspaceInvite = { id: string; workspace_id: string; token: string; role: "editor" | "viewer"; email: string | null; created_at: string; expires_at: string; accepted_at: string | null };

export const ROLE_LABEL: Record<WorkspaceRole, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };
export const ROLE_HELP: Record<WorkspaceRole, string> = {
  owner: "Manages members and can delete characters",
  editor: "Creates and edits characters",
  viewer: "Can see characters, can’t change them",
};

export const inviteUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/studio/invite/${token}`;
