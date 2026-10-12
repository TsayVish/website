import { redirect } from "next/navigation";

// Orgs moved to Settings → Orgs.
export default function Page() {
  redirect("/studio/orgs");
}
