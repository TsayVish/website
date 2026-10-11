"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * The Studio's single live connection. It listens for new messages (in any of your chats)
 * and your notifications, then re-broadcasts them as browser events that badges,
 * lists and open chats subscribe to with `onRealtime`.
 */
export type RealtimeEvent = "message" | "notification" | "status";
const name = (e: RealtimeEvent) => `tsv:${e}`;

let lastStatus = "CONNECTING";

export function onRealtime<T = unknown>(event: RealtimeEvent, cb: (payload: T) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<T>).detail);
  window.addEventListener(name(event), handler);
  return () => window.removeEventListener(name(event), handler);
}

export const realtimeStatus = () => lastStatus;

function emit(event: RealtimeEvent, detail: unknown) {
  window.dispatchEvent(new CustomEvent(name(event), { detail }));
}

export function RealtimeHub({ me }: { me: string }) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`studio-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: { new: unknown }) => emit("message", payload.new))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me}` },
        (payload: { new: unknown }) => emit("notification", payload.new),
      )
      .subscribe((status: string) => {
        lastStatus = status;
        emit("status", status);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me]);
  return null;
}
