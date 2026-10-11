import { redirect } from "next/navigation";

/** Purchases and sales live as tabs on the Marketplace. */
export default async function DealsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/studio/marketplace?type=${tab === "sales" ? "sales" : "purchases"}`);
}
