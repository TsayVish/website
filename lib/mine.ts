// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * A PostgREST filter for "characters and projects that are mine": ones I created, plus
 * ones in workspaces I belong to. Personal pages use it so that staff, who can read
 * everything for moderation, still only see their own work there.
 */
export async function myProjectsFilter(supabase: Db, userId: string) {
  const { data } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", userId);
  const ids = ((data ?? []) as { workspace_id: string }[]).map((r) => r.workspace_id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return ids.length ? `owner_id.eq.${userId},workspace_id.in.(${ids.join(",")})` : `owner_id.eq.${userId}`;
}
