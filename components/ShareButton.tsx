"use client";

import { useState } from "react";

/** Uses the phone's share sheet when there is one; otherwise copies the link. */
export function ShareButton({ url, title, className = "btn ghost" }: { url: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      try {
        if (navigator.share) await navigator.share({ title, url });
        else {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } catch {
        /* dismissed */
      }
    }}>{copied ? "Link copied" : "Share"}</button>
  );
}
