"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { Avatar } from "../Avatar";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_COLUMNS, type ChatMessage } from "@/lib/chat";
import { checkImage, uploadChatImage } from "@/lib/upload";
import { ChatImage } from "./ChatImage";
import { onRealtime, realtimeStatus } from "../realtime/RealtimeHub";
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
  conversationId, me, other, initial, blocked = false, initialDraft = "",
}: {
  conversationId: string;
  me: string;
  other: Member | null;
  initial: ChatMessage[];
  blocked?: boolean;
  initialDraft?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [text, setText] = useState(initialDraft);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
    const off = onRealtime<ChatMessage>("message", (m) => {
      if (m.conversation_id !== conversationId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.filter((x) => !(x.id.startsWith("tmp-") && x.body === m.body && x.sender_id === m.sender_id && Boolean(x.image_path) === Boolean(m.image_path))), m]));
      if (m.sender_id !== me) markRead();
    });
    setLive(realtimeStatus() === "SUBSCRIBED");
    const offStatus = onRealtime<string>("status", (st) => setLive(st === "SUBSCRIBED"));
    return () => {
      off();
      offStatus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, me]);

  // Arriving with a draft (e.g. from an offer): put the cursor at the end, ready to finish it.
  useEffect(() => {
    const el = input.current;
    if (!initialDraft || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Catch up on anything missed: when the tab comes back into view, and every 5s while not live.
  useEffect(() => {
    const catchUp = async () => {
      const { data } = await createClient()
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(50);
      const fresh = ((data ?? []) as ChatMessage[]).reverse();
      if (!fresh.length) return;
      let added = false;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const extra = fresh.filter((m) => !known.has(m.id) && !prev.some((x) => x.id.startsWith("tmp-") && x.body === m.body && x.sender_id === m.sender_id));
        if (!extra.length) return prev;
        added = extra.some((m) => m.sender_id !== me);
        return [...prev, ...extra].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      });
      if (added) markRead();
    };
    const onVisible = () => document.visibilityState === "visible" && catchUp();
    document.addEventListener("visibilitychange", onVisible);
    const poll = live ? null : setInterval(catchUp, 5000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, live]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function pickPhoto(file: File | undefined | null) {
    if (!file) return;
    const problem = checkImage(file, "chat-images");
    if (problem) return setError(problem);
    setError("");
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
    input.current?.focus();
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    pickPhoto(e.target.files?.[0]);
    e.target.value = "";
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      pickPhoto(file);
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    const attached = photo;
    if ((!body && !attached) || sending) return;
    setError("");
    setText("");
    setPhoto(null);
    setSending(true);
    const temp: ChatMessage = {
      id: `tmp-${Date.now()}`, conversation_id: conversationId, sender_id: me, body,
      image_path: attached ? attached.url : null, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);
    const fail = (msg: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setText(body);
      setPhoto(attached);
      setError(msg);
      setSending(false);
    };
    let imagePath: string | null = null;
    if (attached) {
      try {
        imagePath = await uploadChatImage(conversationId, attached.file);
      } catch (err) {
        return fail(`Couldn’t upload the photo: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const { data, error: err } = await createClient()
      .from("messages")
      .insert({ conversation_id: conversationId, body, image_path: imagePath })
      .select(MESSAGE_COLUMNS)
      .single();
    if (err || !data) {
      return fail(
        err?.message.includes("row-level security")
          ? "You can’t message this person right now."
          : `Couldn’t send: ${err?.message ?? "please try again."}`,
      );
    }
    const saved = data as ChatMessage;
    setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev.filter((m) => m.id !== temp.id) : prev.map((m) => (m.id === temp.id ? saved : m))));
    setSending(false);
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
                {m.image_path && <ChatImage path={m.image_path} />}
                {m.body && <p className="chat-bubble">{m.body}</p>}
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
        {photo && (
          <div className="chat-attach">
            <img src={photo.url} alt="Photo to send" />
            <button type="button" className="chat-attach-x" aria-label="Remove photo" onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); }}>×</button>
          </div>
        )}
        <button type="button" className="chat-photo-btn" aria-label="Add a photo" title="Add a photo" onClick={() => fileInput.current?.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m20.5 16-5-5-8 8" /></svg>
        </button>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="visually-hidden" tabIndex={-1} onChange={onFile} />
        <label htmlFor="chat-input" className="visually-hidden">Message {name}</label>
        <textarea
          id="chat-input" ref={input} rows={1} maxLength={4000} value={text}
          placeholder={`Message ${name.split(" ")[0]}`}
          onChange={(e) => { setText(e.target.value); setError(""); }}
          onKeyDown={onKey}
          onPaste={onPaste}
        />
        <button className="btn" type="submit" disabled={(!text.trim() && !photo) || sending}>Send</button>
      </form>
      )}
      {error && <p className="form-error chat-error" role="alert">{error}</p>}
    </section>
  );
}
