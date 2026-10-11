import type { Metadata } from "next";
import { AuthPanel } from "@/components/AuthPanel";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Sign up or log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string }>;
}) {
  const { mode, next, error } = await searchParams;
  return (
    <AuthShell>
      <AuthPanel initialMode={mode === "login" ? "login" : "signup"} next={next} linkError={error === "link"} />
    </AuthShell>
  );
}
