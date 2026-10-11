import { OG_SIZE, ogCard } from "@/lib/og";
import { createPublicClient } from "@/lib/supabase/public";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A listing on tsayvish";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = /^[0-9a-f-]{36}$/i.test(id)
    ? await createPublicClient().from("listings").select("title, summary, type, price, seller_name, character_info").eq("id", id).eq("status", "published").maybeSingle()
    : { data: null };
  const l = data as { title: string; summary: string | null; type: string; price: string | null; seller_name: string | null; character_info: { image_url?: string | null } } | null;
  if (!l) return ogCard({ eyebrow: "tsayvish", title: "Listing not found", subtitle: "", initial: "?" });
  return ogCard({
    eyebrow: l.type === "character" ? "Character" : "Service",
    title: l.title,
    subtitle: [l.price, l.seller_name && `by ${l.seller_name}`].filter(Boolean).join(" · ") || (l.summary ?? ""),
    imageUrl: l.character_info?.image_url ?? null,
    initial: l.title.slice(0, 1).toUpperCase(),
  });
}
