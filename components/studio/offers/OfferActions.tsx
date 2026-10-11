"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageButton } from "@/components/studio/MessageButton";
import { createClient } from "@/lib/supabase/client";
import { dealHref, type OfferStatus } from "@/lib/offers";

/** Accept / decline (seller), withdraw (buyer), and message the other person, for one offer. */
export function OfferActions({
  offerId, status, role, otherId, otherName, draft,
}: {
  offerId: string;
  status: OfferStatus;
  role: "seller" | "buyer";
  otherId: string;
  otherName: string;
  draft: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(status);

  async function run(kind: "accepted" | "declined" | "withdrawn") {
    setBusy(kind);
    setError("");
    const supabase = createClient();
    const { error: err } = kind === "withdrawn"
      ? await supabase.rpc("withdraw_offer", { offer: offerId })
      : await supabase.rpc("respond_to_offer", { offer: offerId, decision: kind });
    setBusy("");
    if (err) return setError(err.message);
    setCurrent(kind);
    window.dispatchEvent(new Event("tsayvish-notes-refresh"));
    router.refresh();
  }

  const first = otherName.split(" ")[0] || "them";
  return (
    <div className="of-actions">
      {current === "pending" && role === "seller" && (
        <>
          <button type="button" className="btn st-small" disabled={!!busy} onClick={() => run("accepted")}>{busy === "accepted" ? "Accepting…" : "Accept"}</button>
          <button type="button" className="btn ghost st-small" disabled={!!busy} onClick={() => run("declined")}>{busy === "declined" ? "Declining…" : "Decline"}</button>
        </>
      )}
      {current === "accepted" && (
        <Link className="btn st-small" href={dealHref(offerId)}>{role === "seller" ? "View sale" : "View purchase"}</Link>
      )}
      <MessageButton userId={otherId} label={`Message ${first}`} className="btn ghost st-small" draft={draft} />
      {current === "pending" && role === "buyer" && (
        <button type="button" className="rp-link" disabled={!!busy} onClick={() => run("withdrawn")}>{busy ? "Withdrawing…" : "Withdraw offer"}</button>
      )}
      {error && <small className="form-error" role="alert">{error}</small>}
    </div>
  );
}
