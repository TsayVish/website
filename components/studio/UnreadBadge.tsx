"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { onRealtime } from "./realtime/RealtimeHub";

/** Unread message count for the sidebar, kept current as messages arrive. */
export function UnreadBadge({ initial, me }: { initial: number; me: string }) {
  const [count, setCount] = useState(initial);
  const path = usePathname();

  useEffect(() => {
    const refresh = () =>
      createClient().rpc("unread_message_count").then(({ data }: { data: unknown }) => typeof data === "number" && setCount(data));
    refresh();
    window.addEventListener("tsayvish-unread-refresh", refresh);
    const off = onRealtime<{ sender_id: string; conversation_id: string }>("message", (m) => {
      if (m.sender_id === me) return;
      if (window.location.pathname === `/studio/messages/${m.conversation_id}`) return;
      setCount((c) => c + 1);
    });
    return () => {
      window.removeEventListener("tsayvish-unread-refresh", refresh);
      off();
    };
  }, [me, path]);

  if (!count) return null;
  return <span className="st-badge" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</span>;
}
