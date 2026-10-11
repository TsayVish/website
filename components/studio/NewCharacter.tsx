import Link from "next/link";
import { CharacterBuilder } from "@/components/CharacterBuilder";
import { UploadCharacterForm } from "@/components/studio/UploadCharacterForm";

/** Choose between designing a new character and bringing one that already exists. */
export function NewCharacter({ upload, base }: { upload: boolean; base: string }) {
  return (
    <div className="st-stack">
      <nav className="nc-switch" aria-label="How to add a character">
        <Link href={base} aria-current={!upload ? "page" : undefined}>
          <b>Create a new character</b>
          <span>Design one from scratch with our builder.</span>
        </Link>
        <Link href={`${base}?mode=upload`} aria-current={upload ? "page" : undefined}>
          <b>Upload an existing character</b>
          <span>Bring a character you already run, with its art, links and rights.</span>
        </Link>
      </nav>
      {upload ? <UploadCharacterForm /> : <CharacterBuilder mode="save" />}
    </div>
  );
}
