import { CharacterArt, Critter } from "@/components/art";
import { castByName, colorValue, moodByName } from "@/lib/content";
import type { Project } from "@/lib/types";

/** The picture for a project: the creator's character, or the first cast member they asked about. */
export function ProjectArt({ project }: { project: Project }) {
  if (project.type === "original" && project.kind) {
    const mood = moodByName(project.personality);
    return (
      <CharacterArt
        name={project.name} kind={project.kind} color={colorValue(project.color)}
        prop={mood.prop} sleepy={mood.sleepy}
      />
    );
  }
  const member = castByName(project.cast_members[0] ?? "") ?? castByName("Pudding");
  return member ? <Critter {...member} /> : null;
}

/** A soft tint of the character's color, for thumbnail backgrounds. */
export function projectBackground(project: Project) {
  const base = project.type === "original" ? colorValue(project.color) : castByName(project.cast_members[0] ?? "")?.body ?? "var(--mint)";
  return `color-mix(in srgb, ${base} 28%, var(--surface))`;
}
