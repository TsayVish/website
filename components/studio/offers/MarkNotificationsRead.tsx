"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Opening the notifications page marks everything as read (the page still highlights what was new). */
export function MarkNotificationsRead({ me, unread }: { me: string; unread: number }) {
  useEffect(() => {
    if (!unread) return;
    createClient()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", me)
      .is("read_at", null)
      .then(() => window.dispatchEvent(new Event("tsayvish-notes-refresh")));
  }, [me, unread]);
  return null;
}
