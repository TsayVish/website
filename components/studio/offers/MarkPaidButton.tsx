"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Seller confirms the buyer has paid. The buyer gets a notification. */
export function MarkPaidButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    const { error: err } = await createClient().rpc("mark_offer_paid", { offer: offerId });
    setBusy(false);
    if (err) return setError(err.message);
    setAsking(false);
    router.refresh();
  }

  if (!asking) return <button type="button" className="btn st-small" onClick={() => setAsking(true)}>Mark as paid</button>;
  return (
    <span className="rp-inline">
      <span>Confirm you’ve received the payment?</span>
      <button type="button" className="btn st-small" onClick={confirm} disabled={busy}>{busy ? "Saving…" : "Yes, I’ve been paid"}</button>
      <button type="button" className="rp-link" onClick={() => setAsking(false)}>Cancel</button>
      {error && <small className="form-error">{error}</small>}
    </span>
  );
}
