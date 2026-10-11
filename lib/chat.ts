import { MEMBER_COLUMNS, type Member } from "./members";

type Supa = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };

export type ConversationSummary = {
  id: string;
  other: Member | null;
  lastMessageAt: string | null;
  preview: string | null;
  unread: boolean;
};

/** The signed-in person's conversations, newest first, with the other member's profile. */
export async function loadConversations(supabase: Supa, me: string): Promise<ConversationSummary[]> {
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at, conversations(id, last_message_at, last_message_preview, created_at)")
    .eq("user_id", me);
  const rows = (mine ?? []) as unknown as {
    conversation_id: string;
    last_read_at: string;
    conversations: { id: string; last_message_at: string | null; last_message_preview: string | null; created_at: string } | null;
  }[];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.conversation_id);
  const { data: others } = await supabase.from("conversation_members").select("conversation_id, user_id").in("conversation_id", ids).neq("user_id", me);
  const otherIds = [...new Set(((others ?? []) as { conversation_id: string; user_id: string }[]).map((o) => o.user_id))];
  const { data: profiles } = otherIds.length
    ? await supabase.from("profiles").select(MEMBER_COLUMNS).in("id", otherIds)
    : { data: [] };
  const byId = new Map(((profiles ?? []) as unknown as Member[]).map((p) => [p.id, p]));
  const otherOf = new Map(((others ?? []) as { conversation_id: string; user_id: string }[]).map((o) => [o.conversation_id, o.user_id]));

  return rows
    .map((r) => {
      const c = r.conversations;
      const otherId = otherOf.get(r.conversation_id);
      return {
        id: r.conversation_id,
        other: otherId ? byId.get(otherId) ?? { id: otherId, full_name: null, avatar_url: null, bio: null, location: null, website: null } : null,
        lastMessageAt: c?.last_message_at ?? null,
        preview: c?.last_message_preview ?? null,
        unread: Boolean(c?.last_message_at && c.last_message_at > r.last_read_at),
        sortKey: c?.last_message_at ?? c?.created_at ?? "",
      };
    })
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))
    .map(({ sortKey: _ignored, ...rest }) => rest);
}

/** "2:14 PM" today, "Mon" this week, otherwise "Oct 3". */
export function shortTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 864e5) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
