import type { Metadata } from "next";
import { PromoManager } from "@/components/studio/hub/PromoManager";
import type { PromoCode } from "@/lib/hub";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: codes, error }, { data: listings }] = await Promise.all([
    supabase.from("promo_codes").select("id, code, percent_off, listing_id, max_uses, expires_on, active, created_at").order("created_at", { ascending: false }),
    supabase.from("listings").select("id, title").eq("owner_id", user!.id).order("created_at", { ascending: false }),
  ]);

  return (
    <div className="st-stack">
      <div className="st-pagehead"><div><h1>Promotions</h1><p className="st-sub">Discount codes for your characters and services.</p></div></div>
      <p className="hub-banner">Codes you create are saved now and will apply automatically once storefront checkout launches. Until then, share them with buyers you’re talking to.</p>
      {error && <p className="form-error" role="alert">Couldn’t load promotions: {error.message}. Run the latest supabase/schema.sql.</p>}
      <PromoManager initial={(codes ?? []) as PromoCode[]} listings={(listings ?? []) as { id: string; title: string }[]} />
    </div>
  );
}
