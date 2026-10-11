"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ListingOwnerActions({ id, status }: { id: string; status: "published" | "hidden" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  async function setVisibility(next: "published" | "hidden") {
    setBusy(true);
    setError("");
    const { error: err } = await createClient().from("listings").update({ status: next }).eq("id", id);
    setBusy(false);
    if (err) return setError(`Couldn’t update: ${err.message}`);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const { error: err } = await createClient().from("listings").delete().eq("id", id);
    if (err) {
      setBusy(false);
      return setError(`Couldn’t delete: ${err.message}`);
    }
    router.push("/studio/marketplace?type=mine");
    router.refresh();
  }

  return (
    <div className="panel st-next">
      <b className="st-panel-title">Your listing</b>
      <p>{status === "published" ? "Visible to everyone signed in." : "Hidden. Only you can see it."}</p>
      <div className="st-actions">
        <Link className="btn ghost st-small" href={`/studio/marketplace/${id}/edit`}>Edit</Link>
        <button type="button" className="btn ghost st-small" disabled={busy} onClick={() => setVisibility(status === "published" ? "hidden" : "published")}>
          {status === "published" ? "Hide listing" : "Publish again"}
        </button>
      </div>
      <div className="st-danger">
        {!asking ? (
          <button type="button" className="st-linkdanger" onClick={() => setAsking(true)}>Delete listing</button>
        ) : (
          <div className="st-confirm" role="group" aria-label="Confirm delete">
            <span>This can’t be undone.</span>
            <button type="button" className="btn st-small st-btn-danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Yes, delete it"}</button>
            <button type="button" className="btn ghost st-small" onClick={() => setAsking(false)} disabled={busy}>Keep it</button>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
