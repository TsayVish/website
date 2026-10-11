import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/studio/Avatar";
import { ThemeButton } from "@/components/ThemeToggle";
import { SidebarFrame } from "@/components/studio/SidebarFrame";
import { SignOutButton } from "@/components/studio/SignOutButton";
import { SettingsLink, StudioNav } from "@/components/studio/StudioNav";
import { createClient } from "@/lib/supabase/server";
import "./studio.css";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?mode=login");

  const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle();
  const p = profile as { full_name: string | null; avatar_url: string | null } | null;
  const name = p?.full_name || "";

  return (
    <div className="st">
      <aside className="st-side">
        <SidebarFrame logo={<Logo />}>
          <StudioNav />
          <div className="st-user">
            <SettingsLink />
            <Link href="/studio/settings" className="st-me">
              <Avatar url={p?.avatar_url} name={name || user.email || "?"} size={32} />
              <span className="st-me-text">
                {name && <span className="st-user-name">{name}</span>}
                <span className="st-user-mail">{user.email}</span>
              </span>
            </Link>
            <div className="st-user-actions">
              <SignOutButton />
              <ThemeButton className="theme-btn st-theme" />
            </div>
          </div>
        </SidebarFrame>
      </aside>
      <main className="st-main">{children}</main>
    </div>
  );
}
