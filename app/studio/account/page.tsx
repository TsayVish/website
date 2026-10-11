import { redirect } from "next/navigation";

// The old Account page now lives in Settings.
export default function AccountPage() {
  redirect("/studio/settings");
}
