import { notFound, redirect } from "next/navigation";
import { myOrgs, type Org, type OrgInvite, type OrgMember } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { OrgList } from "./OrgList";
import { OrgManager } from "./OrgManager";

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?mode=login");
  return { supabase, uid: user.id };
}

export async function OrgsPage({ base }: { base: string }) {
  const { supabase, uid } = await me();
  const [orgs, { data: staff }] = await Promise.all([myOrgs(supabase, uid), supabase.rpc("is_staff")]);
  return <OrgList orgs={orgs} staff={staff === true} base={base} />;
}

export async function OrgPage({ id, base }: { id: string; base: string }) {
  const { supabase, uid } = await me();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: org }, { data: members }, { data: invites }, { data: staff }] = await Promise.all([
    supabase.from("orgs").select("id, name, created_at").eq("id", id).maybeSingle(),
    supabase.rpc("org_member_list", { p_org: id }),
    supabase.from("org_invites").select("id, email, role, created_at").eq("org_id", id).order("created_at", { ascending: false }),
    supabase.rpc("is_staff"),
  ]);
  if (!org) notFound();
  const list = (members ?? []) as OrgMember[];
  const mine = list.find((m) => m.user_id === uid);
  const isOwner = mine?.role === "owner";
  return (
    <OrgManager org={org as Org} members={list} invites={(invites ?? []) as OrgInvite[]} me={uid}
      canManage={isOwner || (staff === true && !!mine)} isOwner={isOwner} base={base} />
  );
}
