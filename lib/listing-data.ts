import type { OwnCharacter } from "@/components/studio/ListingForm";
import type { CharacterKind } from "@/components/art";

type Supa = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

/** The signed-in person's originals, name and email: what the listing form needs. */
export async function listingFormData(supabase: Supa) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase.from("projects").select("id, name, kind, color, personality, image_url").eq("type", "original").order("created_at", { ascending: false }),
    supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle(),
  ]);
  const characters: OwnCharacter[] = ((rows ?? []) as unknown as {
    id: string; name: string; kind: CharacterKind; color: string; personality: string; image_url: string | null;
  }[]).map((r) => ({ ...r }));
  return {
    user: user!,
    characters,
    sellerName: (profile as { full_name: string | null } | null)?.full_name ?? "",
    defaultEmail: user?.email ?? "",
  };
}
