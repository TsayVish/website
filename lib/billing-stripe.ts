/*
 * Server-only Stripe calls for buying credits, using Stripe's REST API directly
 * (no extra package). Keys come from server env vars and never reach the browser.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { packById, type CreditPack } from "./billing";

export type BillingEnv = {
  stripeKey?: string;        // STRIPE_SECRET_KEY (sk_test_… or sk_live_…)
  webhookSecret?: string;    // STRIPE_WEBHOOK_SECRET (whsec_…)
  dbSecret?: string;         // BILLING_DB_SECRET (from select public.new_billing_secret())
  fetch?: typeof fetch;
};

export function billingEnv(): BillingEnv {
  return {
    stripeKey: process.env.STRIPE_SECRET_KEY || undefined,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    dbSecret: process.env.BILLING_DB_SECRET || undefined,
  };
}

export const paymentsReady = (env: BillingEnv) => Boolean(env.stripeKey && env.dbSecret);
export const isTestMode = (env: BillingEnv) => Boolean(env.stripeKey?.startsWith("sk_test_") || env.stripeKey?.startsWith("rk_test_"));

/** Stripe wants application/x-www-form-urlencoded with bracketed keys. */
export function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") parts.push(formEncode(v as Record<string, unknown>, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join("&");
}

async function stripe(env: BillingEnv, method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
  if (!env.stripeKey) throw new Error("Payments aren’t set up yet.");
  const f = env.fetch ?? fetch;
  const res = await f(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? formEncode(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message || `Stripe returned an error (${res.status}).`);
  }
  return json;
}

/** Starts a Stripe Checkout page for a credit pack. Returns the URL to send the person to. */
export async function createCheckout(env: BillingEnv, args: { pack: CreditPack; userId: string; email?: string | null; origin: string }) {
  const { pack, userId, email, origin } = args;
  const session = await stripe(env, "POST", "checkout/sessions", {
    mode: "payment",
    client_reference_id: userId,
    customer_email: email || undefined,
    success_url: `${origin}/studio/credits?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/studio/credits?canceled=1`,
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.cents,
          product_data: { name: `tsayvish AI Studio credits (${pack.label})`, description: "Credits for generating images, voice and video in the AI Studio." },
        },
      },
    },
    metadata: { kind: "credits", user_id: userId, credit_cents: pack.cents, pack: pack.id },
    payment_intent_data: { metadata: { kind: "credits", user_id: userId, credit_cents: pack.cents } },
  });
  if (typeof session.url !== "string") throw new Error("Stripe didn’t return a checkout page.");
  return session.url;
}

export type PaidCredits = { sessionId: string; userId: string; cents: number; note: string };

/** Reads a Checkout Session and returns the credits it paid for, or null if it isn't a paid credits purchase. */
export function paidCredits(session: Record<string, unknown>): PaidCredits | null {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  if (meta.kind !== "credits" || session.payment_status !== "paid") return null;
  const cents = Number(meta.credit_cents);
  const userId = meta.user_id || (session.client_reference_id as string);
  const pack = packById(meta.pack);
  // Credit exactly what was paid, never more than the pack says.
  const paid = Number(session.amount_total);
  if (!userId || !Number.isInteger(cents) || cents <= 0 || (Number.isFinite(paid) && paid < cents)) return null;
  return { sessionId: String(session.id), userId, cents, note: pack ? `${pack.label} credit pack` : "Credits" };
}

export async function getCheckout(env: BillingEnv, sessionId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Unknown checkout.");
  return stripe(env, "GET", `checkout/sessions/${sessionId}`);
}

/** Checks the Stripe-Signature header. Returns the parsed event, or throws. */
export function verifyStripeEvent(payload: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  if (!header) throw new Error("Missing signature.");
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) throw new Error("Bad signature header.");
  if (Math.abs(nowSeconds - t) > toleranceSeconds) throw new Error("Signature too old.");
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) throw new Error("Signature doesn’t match.");
  return JSON.parse(payload) as { id: string; type: string; data: { object: Record<string, unknown> } };
}

/** Test helper: builds a valid Stripe-Signature header. */
export function signStripePayload(payload: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}
