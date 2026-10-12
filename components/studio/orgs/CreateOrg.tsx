"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

/** Admins only: start a new org. You become its owner. */
export function CreateOrg({ base }: { base: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    const { data, error: err } = await createClient().rpc("create_org", { p_name: name.trim() });
    setBusy(false);
    if (err) return setError(err.message);
    router.push(`${base}/${data as string}`);
  }
  return (
    <form className="org-create" onSubmit={submit}>
      <label htmlFor="org-name" className="visually-hidden">Org name</label>
      <input id="org-name" className="st-input" placeholder="New org name, e.g. tsayvish team" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn" type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create org"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
