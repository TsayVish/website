import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/studio/Avatar";
import { ThemeButton } from "@/components/ThemeToggle";
import { SidebarFrame } from "@/components/studio/SidebarFrame";
import { SignOutButton } from "@/components/studio/SignOutButton";
import { RealtimeHub } from "@/components/studio/realtime/RealtimeHub";
import { SettingsLink, StudioNav } from "@/components/studio/StudioNav";
import { VerifyEmailBanner } from "@/components/studio/VerifyEmailBanner";
import { createClient } from "@/lib/supabase/server";
import "./studio.css";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?mode=login");

  const [{ data: profile }, { data: unread }, { data: notes }, { data: banned }] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.rpc("unread_message_count"),
    supabase.rpc("unread_notification_count"),
    supabase.rpc("is_banned"),
    // Joins any orgs this person was invited to by email before they had an account.
    user.email_confirmed_at ? supabase.rpc("claim_org_invites") : Promise.resolve(null),
  ]);
  const unverified = !user.email_confirmed_at;
  const p = profile as { full_name: string | null; avatar_url: string | null } | null;
  const name = p?.full_name || "";

  return (
    <div className="st">
      <RealtimeHub me={user.id} />
      <aside className="st-side">
        <SidebarFrame logo={<Logo />}>
          <StudioNav me={user.id} unread={typeof unread === "number" ? unread : 0} notes={typeof notes === "number" ? notes : 0} />
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
      <main className="st-main">
        {banned === true && (
          <p className="st-alert st-alert-danger" role="alert">
            Your account is restricted, so you can’t post, list, make offers or send messages. If you think this is a mistake, email support@tsayvish.com.
          </p>
        )}
        {unverified && banned !== true && <VerifyEmailBanner email={user.email ?? ""} />}
        {children}
      </main>
    </div>
  );
}
