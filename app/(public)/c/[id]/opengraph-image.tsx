import { OG_SIZE, ogCard } from "@/lib/og";
import { createPublicClient } from "@/lib/supabase/public";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A creator on tsayvish";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = /^[0-9a-f-]{36}$/i.test(id)
    ? await createPublicClient().from("profiles").select("full_name, bio, location, avatar_url").eq("id", id).maybeSingle()
    : { data: null };
  const p = data as { full_name: string | null; bio: string | null; location: string | null; avatar_url: string | null } | null;
  const name = p?.full_name || "tsayvish creator";
  return ogCard({ eyebrow: "Creator", title: name, subtitle: p?.bio || p?.location || "", imageUrl: p?.avatar_url, initial: name.slice(0, 1).toUpperCase() });
}
