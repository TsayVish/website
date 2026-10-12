import type { Metadata } from "next";
import { OrgsPage } from "@/components/studio/orgs/pages";

export const metadata: Metadata = { title: "Orgs" };

export default async function Page() {
  return OrgsPage({ base: "/studio/admin/orgs" });
}
