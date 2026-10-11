"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { onRealtime } from "./realtime/RealtimeHub";

/** Unread notification count for the sidebar, live as new notifications arrive. */
export function NotificationBadge({ initial }: { initial: number; me: string }) {
  const [count, setCount] = useState(initial);
  const path = usePathname();

  useEffect(() => {
    const refresh = () =>
      createClient().rpc("unread_notification_count").then(({ data }: { data: unknown }) => typeof data === "number" && setCount(data));
    refresh();
    window.addEventListener("tsayvish-notes-refresh", refresh);
    const off = onRealtime("notification", () => {
      if (window.location.pathname === "/studio/notifications") return;
      setCount((c) => c + 1);
    });
    return () => {
      window.removeEventListener("tsayvish-notes-refresh", refresh);
      off();
    };
  }, [path]);

  if (!count) return null;
  return <span className="st-badge" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</span>;
}
