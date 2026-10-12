import { SettingsShell } from "@/components/studio/settings/SettingsShell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  return SettingsShell({ children });
}
