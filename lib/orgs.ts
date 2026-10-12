export type OrgRole = "owner" | "member";
export type Org = { id: string; name: string; created_at: string };
export type OrgSummary = Org & { members: number; role: OrgRole };
export type OrgMember = { user_id: string; full_name: string | null; email: string | null; role: OrgRole; is_staff: boolean; joined_at: string };
export type OrgInvite = { id: string; email: string; role: OrgRole; created_at: string };

type Supa = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

/** The orgs this person belongs to, with member counts and their role. */
export async function myOrgs(supabase: Supa, uid: string): Promise<OrgSummary[]> {
  const [{ data: orgs }, { data: members }] = await Promise.all([
    supabase.from("orgs").select("id, name, created_at").order("name"),
    supabase.from("org_members").select("org_id, user_id, role"),
  ]);
  const rows = (members ?? []) as { org_id: string; user_id: string; role: OrgRole }[];
  return ((orgs ?? []) as Org[]).map((o) => ({
    ...o,
    members: rows.filter((m) => m.org_id === o.id).length,
    role: rows.find((m) => m.org_id === o.id && m.user_id === uid)?.role ?? "member",
  }));
}

export const ROLE_LABEL: Record<OrgRole, string> = { owner: "Owner", member: "Member" };
