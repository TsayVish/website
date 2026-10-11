"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { onRealtime } from "./realtime/RealtimeHub";

/**
 * Re-renders the current page when new messages or notifications arrive, so server-rendered
 * lists update without a reload. Also refreshes when the tab comes back into view, and
 * every 60s as a fallback in case the live connection drops.
 */
export function LiveRefresh({ table, ignoreSender }: { table: "messages" | "notifications"; filter?: string; ignoreSender?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    const off = onRealtime<{ sender_id?: string }>(table === "messages" ? "message" : "notification", (row) => {
      if (ignoreSender && row.sender_id === ignoreSender) return;
      refresh();
    });
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => document.visibilityState === "visible" && router.refresh(), 60000);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, ignoreSender]);

  return null;
}
