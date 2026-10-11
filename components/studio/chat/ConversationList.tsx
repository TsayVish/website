import Link from "next/link";
import { Avatar } from "../Avatar";
import { shortTime, type ConversationSummary } from "@/lib/chat";

export function ConversationList({ items, currentId }: { items: ConversationSummary[]; currentId?: string }) {
  return (
    <aside className="chat-list" aria-label="Conversations">
      <div className="chat-list-head"><h1>Messages</h1></div>
      {items.length === 0 ? (
        <p className="st-muted chat-list-empty">
          No conversations yet. Open a creator’s profile or a Marketplace listing and choose “Message”.
        </p>
      ) : (
        <ul>
          {items.map((c) => {
            const name = c.other?.full_name || "tsayvish member";
            return (
              <li key={c.id}>
                <Link href={`/studio/messages/${c.id}`} className="chat-item" aria-current={c.id === currentId ? "page" : undefined}>
                  <Avatar url={c.other?.avatar_url} name={name} size={40} />
                  <span className="chat-item-text">
                    <span className="chat-item-top">
                      <b>{name}</b>
                      {c.lastMessageAt && <time dateTime={c.lastMessageAt}>{shortTime(c.lastMessageAt)}</time>}
                    </span>
                    <span className={c.unread ? "chat-preview unread" : "chat-preview"}>{c.preview ?? "No messages yet"}</span>
                  </span>
                  {c.unread && <span className="chat-dot" aria-label="Unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
