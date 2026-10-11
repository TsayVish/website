"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Unread notification count for the sidebar, live as new notifications arrive. */
export function NotificationBadge({ initial, me }: { initial: number; me: string }) {
  const [count, setCount] = useState(initial);
  const path = usePathname();

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => supabase.rpc("unread_notification_count").then(({ data }: { data: unknown }) => typeof data === "number" && setCount(data));
    refresh();
    window.addEventListener("tsayvish-notes-refresh", refresh);
    const channel = supabase
      .channel("notes-badge")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me}` }, () => {
        if (window.location.pathname === "/studio/notifications") return;
        setCount((c) => c + 1);
      })
      .subscribe();
    return () => {
      window.removeEventListener("tsayvish-notes-refresh", refresh);
      supabase.removeChannel(channel);
    };
  }, [me, path]);

  if (!count) return null;
  return <span className="st-badge" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</span>;
}
