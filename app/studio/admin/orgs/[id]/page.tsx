import { redirect } from "next/navigation";

// Orgs moved to Settings → Orgs.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/studio/orgs/${(await params).id}`);
}
