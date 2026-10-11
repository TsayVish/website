import type { Metadata } from "next";
import { EmailForm } from "@/components/studio/settings/EmailForm";
import { PasswordForm } from "@/components/studio/settings/PasswordForm";
import { ProfileForm } from "@/components/studio/settings/ProfileForm";
import { ThemeSwitch } from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

type ProfileRow = {
  full_name: string | null; goal: "build" | "partner"; avatar_url: string | null;
  bio: string | null; location: string | null; website: string | null; discoverable: boolean | null;
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("profiles")
    .select("full_name, goal, avatar_url, bio, location, website, discoverable")
    .eq("id", user!.id)
    .maybeSingle();
  const p = data as ProfileRow | null;
  const providers = (user!.app_metadata?.providers as string[] | undefined) ?? [user!.app_metadata?.provider ?? "email"];
  const hasPassword = providers.includes("email");

  return (
    <div className="st-stack st-settings">
      <div className="st-pagehead">
        <div>
          <h1>Settings</h1>
          <p className="st-sub">Your profile, sign-in details and preferences.</p>
        </div>
      </div>
      <nav className="st-tabs st-set-nav" aria-label="Settings sections">
        <a href="#profile">Profile</a>
        <a href="#email">Email</a>
        <a href="#password">Password</a>
        <a href="#appearance">Appearance</a>
      </nav>
      <ProfileForm
        userId={user!.id}
        initial={{
          full_name: p?.full_name ?? "",
          bio: p?.bio ?? "",
          location: p?.location ?? "",
          website: p?.website ?? "",
          avatar_url: p?.avatar_url ?? null,
          goal: p?.goal ?? "build",
          discoverable: p?.discoverable ?? true,
        }}
      />
      <EmailForm current={user!.email ?? ""} pending={user!.new_email} />
      <PasswordForm hasPassword={hasPassword} />
      <section className="panel" id="appearance" aria-labelledby="appearance-title">
        <div className="st-set-head">
          <h2 id="appearance-title">Appearance</h2>
          <p className="st-muted">Light is the default. Switch to dark, or follow your device’s setting. Saved in this browser.</p>
        </div>
        <ThemeSwitch />
      </section>
    </div>
  );
}
