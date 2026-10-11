import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/studio/SignOutButton";
import { StudioNav } from "@/components/studio/StudioNav";
import { createClient } from "@/lib/supabase/server";
import "./studio.css";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?mode=login");

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const name = (profile as { full_name: string | null } | null)?.full_name || "";

  return (
    <div className="st">
      <aside className="st-side">
        <Logo />
        <StudioNav />
        <div className="st-user">
          {name && <span className="st-user-name">{name}</span>}
          <span className="st-user-mail">{user.email}</span>
          <SignOutButton />
        </div>
      </aside>
      <main className="st-main">{children}</main>
    </div>
  );
}
