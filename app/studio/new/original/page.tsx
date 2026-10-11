import type { Metadata } from "next";
import Link from "next/link";
import { CharacterBuilder } from "@/components/CharacterBuilder";

export const metadata: Metadata = { title: "New original" };

export default function NewOriginalPage() {
  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs"><Link href="/studio/projects">Projects</Link><span>/</span><span>New original</span></div>
        <h1>Create an original</h1>
        <p className="st-sub">Any kind of character or persona. Switch on the services you want and our team picks them up from there.</p>
      </div>
      <CharacterBuilder mode="save" />
    </div>
  );
}
