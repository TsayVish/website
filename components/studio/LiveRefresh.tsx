"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Re-renders the current page when new rows arrive, so server-rendered lists
 * (notifications, the conversation list) update without a reload.
 * Also refreshes when the tab comes back into view, and every 30s as a fallback
 * in case the live connection drops.
 */
export function LiveRefresh({ table, filter, ignoreSender }: { table: "messages" | "notifications"; filter?: string; ignoreSender?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`live-${table}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table, ...(filter ? { filter } : {}) }, (payload: { new: { sender_id?: string } }) => {
        if (ignoreSender && payload.new.sender_id === ignoreSender) return;
        refresh();
      })
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => document.visibilityState === "visible" && router.refresh(), 30000);
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router, table, filter, ignoreSender]);

  return null;
}
