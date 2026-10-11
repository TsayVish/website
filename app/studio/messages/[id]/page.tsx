import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatThread } from "@/components/studio/chat/ChatThread";
import { ConversationList } from "@/components/studio/chat/ConversationList";
import { LiveRefresh } from "@/components/studio/LiveRefresh";
import { MESSAGE_COLUMNS, loadConversations, type ChatMessage } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft?: string }> }) {
  const { id } = await params;
  const draft = ((await searchParams).draft ?? "").slice(0, 500);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const items = await loadConversations(supabase, user!.id);
  const current = items.find((c) => c.id === id);
  if (!current) notFound();

  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  const initial = ((data ?? []) as ChatMessage[]).reverse();
  const { data: block } = current.other
    ? await supabase.from("blocks").select("blocked_id").eq("blocker_id", user!.id).eq("blocked_id", current.other.id).maybeSingle()
    : { data: null };

  return (
    <div className="chat chat-open">
      <LiveRefresh table="messages" ignoreSender={user!.id} />
      <ConversationList items={items} currentId={id} />
      <ChatThread key={id} conversationId={id} me={user!.id} other={current.other} initial={initial} blocked={Boolean(block)} initialDraft={draft} />
    </div>
  );
}
