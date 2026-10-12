import { money } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { SettingsNav } from "./SettingsNav";

/** One Settings section: account, credits, orgs and admin share one tab bar. */
export async function SettingsShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: staff }, { count }, { data: credits }, { data: free }] = await Promise.all([
    supabase.rpc("is_staff"),
    supabase.from("org_members").select("org_id", { count: "exact", head: true }).eq("user_id", user?.id ?? ""),
    supabase.rpc("credit_balance"),
    supabase.rpc("is_billing_exempt"),
  ]);
  return (
    <div className="hub set-shell">
      <SettingsNav staff={staff === true} inOrg={(count ?? 0) > 0}
        credits={free === true ? "Free" : typeof credits === "number" ? money(credits) : null} />
      <div className="hub-main">{children}</div>
    </div>
  );
}
