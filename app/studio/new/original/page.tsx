import type { Metadata } from "next";
import Link from "next/link";
import { NewCharacter } from "@/components/studio/NewCharacter";

export const metadata: Metadata = { title: "New character" };

export default async function NewOriginalPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return (
    <div className="st-stack">
      <div className="st-hello">
        <div className="st-crumbs"><Link href="/studio/hub/characters">Characters</Link><span>/</span><span>New</span></div>
        <h1>Add a character</h1>
        <p className="st-sub">Any kind of character or persona. Switch on the services you want and our team picks them up from there.</p>
      </div>
      <NewCharacter upload={mode === "upload"} base="/studio/new/original" />
    </div>
  );
}
