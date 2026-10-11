"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Unread message count for the sidebar, kept current as messages arrive. */
export function UnreadBadge({ initial, me }: { initial: number; me: string }) {
  const [count, setCount] = useState(initial);
  const path = usePathname();

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => supabase.rpc("unread_message_count").then(({ data }: { data: unknown }) => typeof data === "number" && setCount(data));
    refresh();
    window.addEventListener("tsayvish-unread-refresh", refresh);
    const channel = supabase
      .channel("unread-badge")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: { new: { sender_id: string; conversation_id: string } }) => {
        if (payload.new.sender_id === me) return;
        if (window.location.pathname === `/studio/messages/${payload.new.conversation_id}`) return;
        setCount((c) => c + 1);
      })
      .subscribe();
    return () => {
      window.removeEventListener("tsayvish-unread-refresh", refresh);
      supabase.removeChannel(channel);
    };
  }, [me, path]);

  if (!count) return null;
  return <span className="st-badge" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</span>;
}
