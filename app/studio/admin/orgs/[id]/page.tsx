import type { Metadata } from "next";
import { OrgPage } from "@/components/studio/orgs/pages";

export const metadata: Metadata = { title: "Org" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return OrgPage({ id, base: "/studio/admin/orgs" });
}
