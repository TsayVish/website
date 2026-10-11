import type { Metadata } from "next";
import { HubNav } from "@/components/studio/hub/HubNav";

export const metadata: Metadata = { title: { default: "Creator hub", template: "%s · Creator hub · tsayvish" } };

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hub">
      <HubNav />
      <div className="hub-main">{children}</div>
    </div>
  );
}
