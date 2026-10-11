import type { Metadata } from "next";
import Link from "next/link";
import { PartnerForm } from "@/components/studio/PartnerForm";

export const metadata: Metadata = { title: "Partner with tsayvish" };

export default function NewPartnershipPage() {
  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs"><Link href="/studio/projects">Projects</Link><span>/</span><span>New partnership</span></div>
        <h1>Partner with tsayvish</h1>
        <p className="st-sub">Tell us who you are and which characters you’d like to work with. Vish or Alexa will follow up.</p>
      </div>
      <PartnerForm />
    </div>
  );
}
