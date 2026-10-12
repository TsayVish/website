import type { Metadata } from "next";
import { AIKeys, type SavedKey, type RunRow } from "@/components/studio/settings/AIKeys";
import { money } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI" };

export default async function AISettingsPage() {
  const supabase = await createClient();
  const [{ data: keys, error }, { data: runs }, { data: balance }, { data: free }] = await Promise.all([
    supabase.from("ai_keys").select("provider, hint, model, is_default, verified_at"),
    supabase.from("ai_runs").select("id, task, provider, model, own_key, price_cents, created_at").order("created_at", { ascending: false }).limit(25),
    supabase.rpc("credit_balance"),
    supabase.rpc("is_billing_exempt"),
  ]);
  const fallback = Boolean(process.env.ANTHROPIC_API_KEY);
  return (
    <div className="st-stack">
      <div className="st-pagehead">
        <div>
          <h1>AI</h1>
          <p className="st-sub">Captions, ideas, posting plans, scripts and character bibles. Use your own Claude or OpenAI API key, or tsayvish credits.</p>
        </div>
      </div>
      {error && <p className="ai-off" role="alert">AI keys aren’t set up in the database yet. Run the latest <code>supabase/schema.sql</code>, then reload.</p>}
      <AIKeys
        keys={(keys ?? []) as SavedKey[]}
        runs={(runs ?? []) as RunRow[]}
        fallback={fallback ? (free === true ? "Free for you" : `Paid from your credits (${money(typeof balance === "number" ? balance : 0)} left)`) : null}
      />
    </div>
  );
}
