import type { Metadata } from "next";
import { AuthPanel } from "@/components/AuthPanel";

export const metadata: Metadata = { title: "Sign up or log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <AuthPanel initialMode={mode === "login" ? "login" : "signup"} />;
}
