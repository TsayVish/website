"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Follow or unfollow a creator, with their follower count beside it. */
export function FollowButton({ creatorId, initialFollowing, initialCount }: { creatorId: string; initialFollowing: boolean; initialCount: number }) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const next = !following;
    const { error: err } = next
      ? await supabase.from("follows").insert({ creator_id: creatorId })
      : await supabase.from("follows").delete().eq("creator_id", creatorId).eq("follower_id", (await supabase.auth.getUser()).data.user?.id ?? "");
    setBusy(false);
    if (err) return setError(err.message);
    setFollowing(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    router.refresh();
  }

  return (
    <span className="msg-btn-wrap">
      <button type="button" className={following ? "btn ghost" : "btn"} aria-pressed={following} onClick={toggle} disabled={busy}>
        {following ? "Following" : "Follow"}
      </button>
      <small className="st-muted">{count} follower{count === 1 ? "" : "s"}</small>
      {error && <small className="form-error" role="alert">{error}</small>}
    </span>
  );
}
