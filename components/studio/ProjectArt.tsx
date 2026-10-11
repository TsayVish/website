import { CharacterPicture, Critter, type CharacterKind } from "@/components/art";
import { castByName, colorValue, moodByName } from "@/lib/content";
import type { CharacterInfo, Project } from "@/lib/types";

/** A saved character's picture from its stored fields (used by projects and marketplace listings). */
export function SavedCharacter({ info, fallbackName }: { info: CharacterInfo; fallbackName: string }) {
  const mood = moodByName(info.personality);
  return (
    <CharacterPicture
      name={info.name || fallbackName}
      kind={(info.kind ?? "Person") as CharacterKind}
      color={colorValue(info.color)}
      prop={mood.prop}
      sleepy={mood.sleepy}
      imageUrl={info.image_url}
    />
  );
}

/** The picture for a project: the creator's character, or the first cast member they asked about. */
export function ProjectArt({ project }: { project: Project }) {
  if (project.type === "original" && project.kind) {
    return (
      <SavedCharacter
        fallbackName={project.name}
        info={{ name: project.name, kind: project.kind, color: project.color ?? undefined, personality: project.personality ?? undefined, image_url: project.image_url }}
      />
    );
  }
  const member = castByName(project.cast_members[0] ?? "") ?? castByName("Pudding");
  return member ? <Critter {...member} /> : null;
}

/** A soft tint of the character's color, for thumbnail backgrounds. */
export function tint(color: string) {
  return `color-mix(in srgb, ${color} 28%, var(--surface))`;
}

export function projectBackground(project: Project) {
  const base = project.type === "original" ? colorValue(project.color) : castByName(project.cast_members[0] ?? "")?.body ?? "var(--mint)";
  return tint(base);
}
