import type { Metadata } from "next";
import Link from "next/link";
import { AccountForm } from "@/components/studio/AccountForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase.from("profiles").select("full_name, goal").eq("id", user!.id).maybeSingle();
  const profile = data as { full_name: string | null; goal: "build" | "partner" } | null;

  return (
    <div className="st-stack st-narrow">
      <div className="st-hello">
        <Link href="/studio" className="st-back">← Projects</Link>
        <span className="eyebrow">Account</span>
        <h1>Your account</h1>
      </div>
      <AccountForm email={user!.email ?? ""} initialName={profile?.full_name ?? ""} initialGoal={profile?.goal ?? "build"} />
    </div>
  );
}
