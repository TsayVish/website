import type { Metadata } from "next";
import { ConversationList } from "@/components/studio/chat/ConversationList";
import { LiveRefresh } from "@/components/studio/LiveRefresh";
import { loadConversations } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const items = await loadConversations(supabase, user!.id);
  return (
    <div className="chat">
      <LiveRefresh table="messages" ignoreSender={user!.id} />
      <ConversationList items={items} />
      <div className="chat-placeholder">
        <p>{items.length ? "Choose a conversation." : "Your conversations will appear here."}</p>
      </div>
    </div>
  );
}
