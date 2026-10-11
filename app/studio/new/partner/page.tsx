import type { Metadata } from "next";
import Link from "next/link";
import { PartnerForm } from "@/components/studio/PartnerForm";

export const metadata: Metadata = { title: "Partner with tsayvish" };

export default function NewPartnershipPage() {
  return (
    <div className="st-stack">
      <div className="st-hello">
        <Link href="/studio" className="st-back">← Projects</Link>
        <span className="eyebrow">New partnership</span>
        <h1>Partner with the tsayvish cast</h1>
        <p className="lede">Tell us who you are and which characters you’d like to work with. Vish or Alexa will follow up.</p>
      </div>
      <PartnerForm />
    </div>
  );
}
