"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Shown until the member confirms their email. Listing, offers and messages need a confirmed email. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  return (
    <p className="st-alert" role="status">
      Confirm your email ({email}) to list, make offers and send messages.{" "}
      {state === "sent" ? (
        <b>Sent. Check your inbox.</b>
      ) : (
        <button type="button" className="rp-link" disabled={state === "sending"} onClick={async () => {
          setState("sending");
          const { error: err } = await createClient().auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/studio` } });
          if (err) { setError(err.message); setState("error"); } else setState("sent");
        }}>{state === "sending" ? "Sending…" : "Resend the link"}</button>
      )}
      {state === "error" && <small className="form-error"> {error}</small>}
    </p>
  );
}
