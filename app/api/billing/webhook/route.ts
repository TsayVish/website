import { NextResponse, type NextRequest } from "next/server";
import { billingEnv, paidCredits, verifyStripeEvent } from "@/lib/billing-stripe";
import { recordPurchase } from "@/lib/billing-server";
import { createPublicClient } from "@/lib/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe calls this when a checkout is paid. Add it in Stripe → Developers → Webhooks:
//   https://<your site>/api/billing/webhook  with events checkout.session.completed and
//   checkout.session.async_payment_succeeded. Its signing secret goes in STRIPE_WEBHOOK_SECRET.
export async function POST(request: NextRequest) {
  const env = billingEnv();
  if (!env.webhookSecret) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  const payload = await request.text();
  let event;
  try {
    event = verifyStripeEvent(payload, request.headers.get("stripe-signature"), env.webhookSecret);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bad signature." }, { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const paid = paidCredits(event.data.object);
    if (paid) {
      try {
        await recordPurchase(createPublicClient(), env, paid);
      } catch (e) {
        console.error("[billing] webhook", e);
        // A non-2xx makes Stripe retry later.
        return NextResponse.json({ error: "Couldn’t record the purchase." }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ received: true });
}
