import { test } from "node:test";
import assert from "node:assert/strict";
import { CREDIT_PACKS, money, packById, priceFor } from "../../lib/billing.ts";
import { createCheckout, formEncode, paidCredits, signStripePayload, verifyStripeEvent } from "../../lib/billing-stripe.ts";

test("prices: provider cost × markup, rounded up like the database", () => {
  assert.equal(priceFor(35), 53);
  assert.equal(priceFor(8), 12);
  assert.equal(priceFor(1), 2);
  assert.equal(priceFor(0), 1);
  assert.equal(priceFor(70, 2), 140);
  assert.equal(money(1234), "$12.34");
  assert.equal(money(-53), "−$0.53");
  assert.ok(packById("pack-10"));
  assert.equal(packById("free-money"), undefined);
  assert.ok(CREDIT_PACKS.every((p) => p.cents >= 500), "packs are big enough that card fees stay small");
});

test("stripe: form encoding and checkout request", async () => {
  assert.equal(formEncode({ a: 1, b: { c: "x y", d: { 0: { e: 2 } } }, skip: undefined }), "a=1&b%5Bc%5D=x%20y&b%5Bd%5D%5B0%5D%5Be%5D=2");
  let seen: { url: string; body: string; auth: string } | null = null;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen = { url, body: String(init.body), auth: (init.headers as Record<string, string>).Authorization };
    return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200 });
  }) as unknown as typeof fetch;
  const url = await createCheckout({ stripeKey: "sk_test_x", fetch: fakeFetch }, { pack: packById("pack-10")!, userId: "u1", email: "a@b.c", origin: "https://tsayvish.com" });
  assert.equal(url, "https://checkout.stripe.com/c/pay/cs_test_1");
  assert.equal(seen!.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(seen!.auth, "Bearer sk_test_x");
  const params = new URLSearchParams(seen!.body);
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "1000");
  assert.equal(params.get("metadata[user_id]"), "u1");
  assert.equal(params.get("metadata[credit_cents]"), "1000");
  assert.equal(params.get("success_url"), "https://tsayvish.com/studio/credits?session_id={CHECKOUT_SESSION_ID}");
});

test("stripe: only paid credit sessions add credits", () => {
  const base = { id: "cs_1", payment_status: "paid", amount_total: 1000, client_reference_id: "u1", metadata: { kind: "credits", user_id: "u1", credit_cents: "1000", pack: "pack-10" } };
  assert.deepEqual(paidCredits(base), { sessionId: "cs_1", userId: "u1", cents: 1000, note: "$10 credit pack" });
  assert.equal(paidCredits({ ...base, payment_status: "unpaid" }), null);
  assert.equal(paidCredits({ ...base, metadata: { ...base.metadata, kind: "other" } }), null);
  assert.equal(paidCredits({ ...base, amount_total: 500 }), null, "never credit more than was paid");
});

test("stripe: webhook signatures", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
  const now = 1_800_000_000;
  const header = signStripePayload(payload, "whsec_test", now);
  assert.equal(verifyStripeEvent(payload, header, "whsec_test", now).type, "checkout.session.completed");
  assert.throws(() => verifyStripeEvent(payload, header, "whsec_other", now), /match/);
  assert.throws(() => verifyStripeEvent(payload + " ", header, "whsec_test", now), /match/);
  assert.throws(() => verifyStripeEvent(payload, header, "whsec_test", now + 3600), /too old/);
  assert.throws(() => verifyStripeEvent(payload, null, "whsec_test", now), /Missing/);
});
