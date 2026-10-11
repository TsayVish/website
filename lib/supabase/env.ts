// Reads the two public Supabase settings. Next.js inlines NEXT_PUBLIC_* values at build time,
// so they must be referenced literally (not through a variable key).
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase isn't configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "to .env.local (for local dev) and to Vercel → Settings → Environment Variables, then restart or redeploy.",
    );
  }
  return { url, key };
}
