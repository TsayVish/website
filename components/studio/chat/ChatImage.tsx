"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Signed links last an hour; keep them for the session so scrolling doesn't refetch.
const cache = new Map<string, string>();

/** A photo in a chat. Chat photos are private, so each one is shown through a short-lived signed link. */
export function ChatImage({ path }: { path: string }) {
  const local = path.startsWith("blob:");
  const [url, setUrl] = useState<string | null>(local ? path : cache.get(path) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (local || cache.has(path)) return;
    let alive = true;
    createClient()
      .storage.from("chat-images")
      .createSignedUrl(path, 3600)
      .then(({ data, error }: { data: { signedUrl: string } | null; error: { message: string } | null }) => {
        if (!alive) return;
        if (error || !data) return setFailed(true);
        cache.set(path, data.signedUrl);
        setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path, local]);

  if (failed) return <p className="chat-bubble chat-img-missing">Photo unavailable</p>;
  if (!url) return <span className="chat-img chat-img-loading" aria-label="Loading photo" />;
  return (
    <a className="chat-img" href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="Photo" loading="lazy" />
    </a>
  );
}
