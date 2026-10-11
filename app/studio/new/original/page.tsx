import type { Metadata } from "next";
import Link from "next/link";
import { CharacterBuilder } from "@/components/CharacterBuilder";

export const metadata: Metadata = { title: "New original" };

export default function NewOriginalPage() {
  return (
    <div className="st-stack">
      <div className="st-hello">
        <Link href="/studio" className="st-back">← Projects</Link>
        <span className="eyebrow">New original</span>
        <h1>Make a character</h1>
        <p className="lede">Any kind of character or persona. Switch on the services you want and we’ll pick them up from there.</p>
      </div>
      <CharacterBuilder mode="save" />
    </div>
  );
}
