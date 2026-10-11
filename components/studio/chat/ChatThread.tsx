"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Avatar } from "../Avatar";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/chat";
import type { Member } from "@/lib/members";

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** One conversation: messages arrive live, and sending shows instantly. */
export function ChatThread({
  conversationId, me, other, initial, blocked = false,
}: {
  conversationId: string;
  me: string;
  other: Member | null;
  initial: ChatMessage[];
  blocked?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const name = other?.full_name || "tsayvish member";

  // Mark as read now and whenever a new message arrives while this chat is open.
  const markRead = () =>
    createClient().from("conversation_members").update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId).eq("user_id", me)
      .then(() => window.dispatchEvent(new Event("tsayvish-unread-refresh")));

  useEffect(() => {
    markRead();
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload: { new: ChatMessage }) => {
          const m = payload.new;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.filter((x) => !(x.id.startsWith("tmp-") && x.body === m.body && x.sender_id === m.sender_id)), m]));
          if (m.sender_id !== me) markRead();
        },
      )
      .subscribe((status: string) => setLive(status === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, me]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError("");
    setText("");
    const temp: ChatMessage = { id: `tmp-${Date.now()}`, conversation_id: conversationId, sender_id: me, body, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, temp]);
    const { data, error: err } = await createClient()
      .from("messages")
      .insert({ conversation_id: conversationId, body })
      .select("id, conversation_id, sender_id, body, created_at")
      .single();
    if (err || !data) {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setText(body);
      setError(
        err?.message.includes("row-level security")
          ? "You can’t message this person right now."
          : `Couldn’t send: ${err?.message ?? "please try again."}`,
      );
      return;
    }
    const saved = data as ChatMessage;
    setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev.filter((m) => m.id !== temp.id) : prev.map((m) => (m.id === temp.id ? saved : m))));
    router.refresh(); // updates the conversation list preview
    input.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  let lastDay = "";
  return (
    <section className="chat-thread" aria-label={`Conversation with ${name}`}>
      <header className="chat-thread-head">
        <Link href="/studio/messages" className="chat-back" aria-label="All conversations">‹</Link>
        <Avatar url={other?.avatar_url} name={name} size={36} />
        <span className="chat-thread-who">
          <b>{name}</b>
          <small>{live ? "Live" : "Connecting…"}</small>
        </span>
        {other && <Link className="btn ghost st-small" href={`/studio/u/${other.id}`}>Profile</Link>}
      </header>

      <div className="chat-scroll" ref={scroller} role="log" aria-live="polite">
        {messages.length === 0 && <p className="chat-start">Say hello to {name.split(" ")[0]}. Messages are only visible to the two of you.</p>}
        {messages.map((m) => {
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.sender_id === me;
          return (
            <div key={m.id}>
              {showDay && <div className="chat-day"><span>{day}</span></div>}
              <div className={mine ? "chat-msg mine" : "chat-msg"}>
                <p className="chat-bubble">{m.body}</p>
                <time dateTime={m.created_at}>{m.id.startsWith("tmp-") ? "Sending…" : time(m.created_at)}</time>
              </div>
            </div>
          );
        })}
      </div>

      {blocked ? (
        <p className="chat-blocked">You’ve blocked {name.split(" ")[0]}. {other && <Link href={`/studio/u/${other.id}`}>Unblock on their profile</Link>}</p>
      ) : (
      <form className="chat-compose" onSubmit={send}>
        <label htmlFor="chat-input" className="visually-hidden">Message {name}</label>
        <textarea
          id="chat-input" ref={input} rows={1} maxLength={4000} value={text}
          placeholder={`Message ${name.split(" ")[0]}`}
          onChange={(e) => { setText(e.target.value); setError(""); }}
          onKeyDown={onKey}
        />
        <button className="btn" type="submit" disabled={!text.trim()}>Send</button>
      </form>
      )}
      {error && <p className="form-error chat-error" role="alert">{error}</p>}
    </section>
  );
}
