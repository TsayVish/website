import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/studio/SignOutButton";
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
  const name = (profile as { full_name: string | null } | null)?.full_name || user.email || "";

  return (
    <div className="st">
      <header className="st-header">
        <div className="wrap st-header-row">
          <Logo />
          <nav className="st-links" aria-label="Studio">
            <Link href="/studio">Projects</Link>
            <Link href="/studio/new/original">New original</Link>
            <Link href="/studio/new/partner">Partner with us</Link>
            <Link href="/studio/account">Account</Link>
          </nav>
          <div className="st-who">
            <span className="st-name" title={user.email ?? undefined}>{name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="wrap st-main">{children}</main>
    </div>
  );
}
