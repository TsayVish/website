import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** A signed-out Supabase client for public pages, share images and the sitemap. Sees only what visitors may see. */
export function createPublicClient() {
  const { url, key } = supabaseEnv();
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export { SITE_URL } from "@/lib/site";
