type Supa = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

/** Workspaces the signed-in person can add characters to (owner or editor). */
export async function editableWorkspaces(supabase: Supa) {
  const { data } = await supabase.from("workspaces").select("id, name").order("name");
  const all = (data ?? []) as { id: string; name: string }[];
  const roles = await Promise.all(all.map((w) => supabase.rpc("workspace_role", { ws: w.id })));
  return all.filter((_, i) => ["owner", "editor"].includes(String(roles[i].data)));
}
