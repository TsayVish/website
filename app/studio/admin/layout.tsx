import type { Metadata } from "next";
import { SectionNav } from "@/components/studio/SectionNav";
import { SettingsShell } from "@/components/studio/settings/SettingsShell";
import { requireStaff } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · tsayvish" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  await requireStaff(supabase);
  const head = { count: "exact" as const, head: true };
  const [{ count: services }, { count: reports }, { count: partnerships }] = await Promise.all([
    supabase.from("project_services").select("project_id", head).eq("status", "requested"),
    supabase.from("reports").select("id", head).eq("status", "open"),
    supabase.from("projects").select("id", head).eq("type", "partnership").in("status", ["submitted", "in_review"]),
  ]);
  return SettingsShell({ children: (
    <div className="adm">
      <SectionNav label="Admin" sub items={[
        { href: "/studio/admin", label: "Overview", exact: true },
        { href: "/studio/admin/services", label: "Service requests", badge: services ?? 0 },
        { href: "/studio/admin/partnerships", label: "Partnerships", badge: partnerships ?? 0 },
        { href: "/studio/admin/reports", label: "Reports", badge: reports ?? 0 },
        { href: "/studio/admin/users", label: "Members" },
        { href: "/studio/admin/billing", label: "Billing" },
        { href: "/studio/admin/audit", label: "Audit log" },
      ]} />
      {children}
    </div>
  ) });
}
