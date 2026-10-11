import Link from "next/link";
import { NewCharacterForms } from "@/components/studio/NewCharacterForms";

/** Choose between designing a new character and bringing one that already exists. */
export function NewCharacter({ upload, base, workspace, editable }: { upload: boolean; base: string; workspace?: string | null; editable: { id: string; name: string }[] }) {
  const q = workspace ? `ws=${workspace}` : "";
  return (
    <div className="st-stack">
      <nav className="nc-switch" aria-label="How to add a character">
        <Link href={`${base}${q ? `?${q}` : ""}`} aria-current={!upload ? "page" : undefined}>
          <b>Create a new character</b>
          <span>Design one from scratch with our builder.</span>
        </Link>
        <Link href={`${base}?mode=upload${q ? `&${q}` : ""}`} aria-current={upload ? "page" : undefined}>
          <b>Upload an existing character</b>
          <span>Bring a character you already run, with its art, links and rights.</span>
        </Link>
      </nav>
      <NewCharacterForms upload={upload} workspaces={editable} defaultWorkspace={workspace} />
    </div>
  );
}
