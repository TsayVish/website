"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

/** "Make an offer" on a Marketplace listing. The seller gets a notification right away. */
export function MakeOffer({ listingId, sellerName, askingPrice }: { listingId: string; sellerName: string; askingPrice: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const amount = Number(String(d.get("amount") ?? "").replace(/[$,\s]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter an amount in dollars, like 500.");
    if (amount > 10_000_000) return setError("That’s above the $10,000,000 limit.");
    setBusy(true);
    setError("");
    const { error: err } = await createClient().from("offers").insert({
      listing_id: listingId,
      amount: Math.round(amount * 100) / 100,
      message: String(d.get("message") ?? "").trim().slice(0, 1000) || null,
    });
    setBusy(false);
    if (err) {
      return setError(err.message.includes("offers_one_pending") || err.message.includes("duplicate")
        ? "You already have an open offer on this listing. Withdraw it to make a new one."
        : err.message);
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>Make an offer</button>;
  return (
    <form className="of-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="of-amount">Your offer {askingPrice && <span className="opt-hint">(listed at {askingPrice})</span>}</label>
        <div className="of-money">
          <span aria-hidden="true">$</span>
          <input className="st-input" id="of-amount" name="amount" inputMode="decimal" placeholder="500" autoComplete="off" required autoFocus />
          <span className="of-cur">USD</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="of-msg">Note to {sellerName.split(" ")[0] || "the seller"} <span className="opt-hint">(optional)</span></label>
        <textarea className="st-input" id="of-msg" name="message" rows={3} maxLength={1000} placeholder="Timing, scope, what you’d use it for…" />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="st-actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send offer"}</button>
        <button className="btn ghost" type="button" onClick={() => { setOpen(false); setError(""); }}>Cancel</button>
      </div>
      <p className="st-help">Offers aren’t binding. {sellerName.split(" ")[0] || "The seller"} can accept, decline or message you about it. Amounts are in US dollars.</p>
    </form>
  );
}
