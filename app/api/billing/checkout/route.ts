import { NextResponse, type NextRequest } from "next/server";
import { packById } from "@/lib/billing";
import { billingEnv, createCheckout, paymentsReady } from "@/lib/billing-stripe";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Starts Stripe Checkout for a credit pack and returns the page to send the person to.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You’ve been logged out. Log in again." }, { status: 401 });
  const env = billingEnv();
  if (!paymentsReady(env)) return NextResponse.json({ error: "Buying credits isn’t switched on yet." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { pack?: string };
  const pack = packById(body.pack);
  if (!pack) return NextResponse.json({ error: "Choose a credit pack." }, { status: 400 });
  // Come back to the same site (production or a preview) after paying.
  const origin = new URL(request.url).origin || SITE_URL;
  try {
    const url = await createCheckout(env, { pack, userId: user.id, email: user.email, origin });
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[billing] checkout", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn’t start checkout." }, { status: 502 });
  }
}
