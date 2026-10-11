import type { Metadata } from "next";
import { Onboarding } from "@/components/studio/Onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user!.id).maybeSingle();
  const p = data as { full_name: string | null; avatar_url: string | null } | null;
  return <Onboarding me={user!.id} initialName={p?.full_name ?? ""} initialAvatar={p?.avatar_url ?? null} />;
}
