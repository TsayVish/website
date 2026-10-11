import type { MetadataRoute } from "next";
import { createPublicClient, SITE_URL } from "@/lib/supabase/public";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed: MetadataRoute.Sitemap = ["", "/explore", "/legal/terms", "/legal/privacy", "/legal/creator-agreement", "/legal/dmca"]
    .map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.5 }));
  try {
    const supabase = createPublicClient();
    const [{ data: ls }, { data: ps }] = await Promise.all([
      supabase.from("listings").select("id, updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(5000),
      supabase.from("profiles").select("id, created_at").eq("discoverable", true).limit(5000),
    ]);
    return [
      ...fixed,
      ...((ls ?? []) as { id: string; updated_at: string }[]).map((l) => ({ url: `${SITE_URL}/l/${l.id}`, lastModified: l.updated_at, priority: 0.7 })),
      ...((ps ?? []) as { id: string; created_at: string }[]).map((p) => ({ url: `${SITE_URL}/c/${p.id}`, lastModified: p.created_at, priority: 0.6 })),
    ];
  } catch {
    return fixed;
  }
}
