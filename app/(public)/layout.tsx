import { PublicShell } from "@/components/PublicShell";
import { createClient } from "@/lib/supabase/server";
import "../studio/studio.css";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  let signedIn = false;
  try {
    signedIn = Boolean((await (await createClient()).auth.getUser()).data.user);
  } catch {
    signedIn = false;
  }
  return <PublicShell signedIn={signedIn}>{children}</PublicShell>;
}
