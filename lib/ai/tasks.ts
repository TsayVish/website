/*
 * The built-in AI writing tools: what each one asks the model for, and how its answer is
 * checked before it reaches the page. Pure functions (no network), so they're easy to test.
 */
import type { StyleGuide } from "../characters";

export type Platform = "instagram" | "facebook" | "youtube" | "tiktok";
const PLATFORMS: Platform[] = ["instagram", "facebook", "youtube", "tiktok"];
export const FORMATS = ["post", "reel", "short", "story", "carousel", "episode", "other"] as const;
export type Format = (typeof FORMATS)[number];

export type Character = {
  name: string; kind?: string | null; personality?: string | null; description?: string | null; guide: StyleGuide;
};

export type TaskName = "caption" | "ideas" | "plan" | "script" | "bible" | "rewrite";
export const TASKS: TaskName[] = ["caption", "ideas", "plan", "script", "bible", "rewrite"];

export type CaptionResult = { captions: Partial<Record<Platform, string>>; hashtags: string[] };
export type Idea = { title: string; hook: string; format: Format; platforms: Platform[]; caption: string };
export type PlanItem = Idea & { date: string; time: string };
export type ScriptResult = { title: string; scenes: { shot: string; line: string }[] };
export type BibleResult = Required<Pick<StyleGuide, "bio" | "backstory" | "traits" | "world" | "voice" | "dos" | "donts">> & { catchphrases: string[] };

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number, each: number) => (Array.isArray(v) ? v.map((x) => s(x, each)).filter(Boolean).slice(0, max) : []);
const platformsOf = (v: unknown) => (Array.isArray(v) ? v.filter((p): p is Platform => PLATFORMS.includes(p as Platform)) : []);
const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** Who the character is, for every prompt. */
export function characterBrief(c: Character) {
  const g = c.guide;
  const lines = [
    `Name: ${c.name}`,
    c.kind && `Kind: ${c.kind}`,
    c.personality && `Personality type: ${c.personality}`,
    c.description && `Description: ${c.description}`,
    g.bio && `Bio: ${g.bio}`,
    g.backstory && `Backstory: ${g.backstory}`,
    g.traits && `Traits and quirks: ${g.traits}`,
    g.world && `World and recurring cast: ${g.world}`,
    g.voice && `Voice and tone: ${g.voice}`,
    g.catchphrases?.length && `Catchphrases: ${g.catchphrases.map((x) => `“${x}”`).join(", ")}`,
    g.dos && `Always: ${g.dos}`,
    g.donts && `Never: ${g.donts}`,
  ].filter(Boolean);
  return lines.join("\n");
}

const SYSTEM = (c: Character) => `You are the head writer for "${c.name}", an original animated character run as a social media personality by an independent creator.
Stay true to the character bible below. Write fresh, specific, platform-native content. Never use real people's names, other companies' characters or trademarks, or copyrighted song lyrics. Keep everything brand-safe and suitable for a general audience.

CHARACTER BIBLE
${characterBrief(c)}

Reply with JSON only (no markdown fences, no commentary), exactly in the shape asked for.`;

const PLATFORM_NOTES = "Instagram: hooky first line, line breaks, up to 5 relevant hashtags. TikTok: short and punchy, 3-5 hashtags. YouTube Shorts: a title-like first line, then one or two sentences. Facebook: conversational, 0-2 hashtags.";

export type BuiltPrompt = { system: string; prompt: string; maxTokens: number };

/** Turns a task and its input into a prompt. Throws on bad input. */
export function buildPrompt(task: TaskName, c: Character, input: Record<string, unknown>): BuiltPrompt {
  const system = SYSTEM(c);
  switch (task) {
    case "caption": {
      const platforms = platformsOf(input.platforms);
      const use = platforms.length ? platforms : PLATFORMS;
      const brief = s(input.brief, 3000);
      if (!brief) throw new Error("Describe what the post is about.");
      return {
        system, maxTokens: 1500,
        prompt: `Write a caption for each of these platforms: ${use.join(", ")}.
The post: ${brief}
${s(input.current, 3000) ? `Current draft to improve on: ${s(input.current, 3000)}\n` : ""}${PLATFORM_NOTES}
JSON shape: {"captions": {${use.map((p) => `"${p}": "..."`).join(", ")}}, "hashtags": ["#..."]}`,
      };
    }
    case "ideas": {
      const n = clampInt(input.count, 1, 12, 6);
      return {
        system, maxTokens: 2500,
        prompt: `Brainstorm ${n} distinct post ideas for ${c.name}.${s(input.theme, 500) ? ` Theme or campaign: ${s(input.theme, 500)}.` : ""}
Platforms in play: ${(platformsOf(input.platforms).length ? platformsOf(input.platforms) : PLATFORMS).join(", ")}.
Mix formats (reels/shorts/posts/carousels/stories). Each idea needs a scroll-stopping hook and a ready-to-use caption.
JSON shape: {"ideas": [{"title": "short working title", "hook": "first line or opening beat", "format": "${FORMATS.join("|")}", "platforms": ["tiktok", ...], "caption": "..."}]}`,
      };
    }
    case "plan": {
      const days = clampInt(input.days, 3, 31, 7);
      const perWeek = clampInt(input.perWeek, 1, 21, 5);
      const start = /^\d{4}-\d{2}-\d{2}$/.test(String(input.start)) ? String(input.start) : new Date().toISOString().slice(0, 10);
      const platforms = platformsOf(input.platforms).length ? platformsOf(input.platforms) : PLATFORMS;
      return {
        system, maxTokens: 4000,
        prompt: `Plan ${c.name}'s posting calendar for ${days} days starting ${start}, about ${perWeek} posts per week, on: ${platforms.join(", ")}.${s(input.theme, 500) ? ` Focus: ${s(input.theme, 500)}.` : ""}
Pick posting times that suit each platform's audience in the creator's local time zone${s(input.timezone, 60) ? ` (${s(input.timezone, 60)})` : ""}, spread posts sensibly, and vary formats. Build small running bits or series where it fits the character.
JSON shape: {"items": [{"date": "YYYY-MM-DD", "time": "HH:MM (24h)", "title": "...", "hook": "...", "format": "${FORMATS.join("|")}", "platforms": ["..."], "caption": "..."}]}`,
      };
    }
    case "script": {
      const scenes = clampInt(input.scenes, 2, 12, 4);
      const premise = s(input.premise, 2000);
      if (!premise) throw new Error("Describe the episode’s premise.");
      return {
        system, maxTokens: 3000,
        prompt: `Write a short vertical-video episode script (about ${clampInt(input.seconds, 10, 180, 30)} seconds) in ${scenes} scenes.
Premise: ${premise}
For each scene: "shot" describes what we see (framing, action, setting) for an AI video generator; "line" is what ${c.name} says (one or two short sentences, in voice; empty string if silent).
JSON shape: {"title": "...", "scenes": [{"shot": "...", "line": "..."}]}`,
      };
    }
    case "bible": {
      return {
        system: system.replace("Stay true to the character bible below.", "Develop and deepen the character bible below; keep anything already established."),
        maxTokens: 2500,
        prompt: `Write a complete character bible for ${c.name}.${s(input.notes, 2000) ? ` Creator's notes: ${s(input.notes, 2000)}` : ""}
Fields: bio (1-2 sentences), backstory (a short paragraph), traits (personality, quirks, likes, dislikes), world (where they live, friends, recurring places), voice (how they talk), catchphrases (3-6), dos (things they always do), donts (things they never do).
JSON shape: {"bio": "...", "backstory": "...", "traits": "...", "world": "...", "voice": "...", "catchphrases": ["..."], "dos": "...", "donts": "..."}`,
      };
    }
    case "rewrite": {
      const text = s(input.text, 6000);
      if (!text) throw new Error("There’s no text to rewrite.");
      return {
        system, maxTokens: 2000,
        prompt: `Rewrite this in ${c.name}'s voice. Instruction: ${s(input.instruction, 500) || "make it punchier"}.
Text: ${text}
JSON shape: {"text": "..."}`,
      };
    }
  }
}

/** Pulls the JSON object out of a reply, tolerating code fences or stray text around it. */
export function extractJson(text: string): Record<string, unknown> {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI’s answer wasn’t in the expected format. Try again.");
  try { return JSON.parse(t.slice(start, end + 1)); } catch { throw new Error("The AI’s answer wasn’t in the expected format. Try again."); }
}

const formatOf = (v: unknown): Format => (FORMATS.includes(v as Format) ? (v as Format) : "post");
const idea = (x: Record<string, unknown>): Idea => ({
  title: s(x.title, 200) || "Untitled idea", hook: s(x.hook, 500), format: formatOf(x.format),
  platforms: platformsOf(x.platforms), caption: s(x.caption, 2200),
});

/** Checks and tidies a model's answer for a task. */
export function parseResult(task: TaskName, text: string) {
  const j = extractJson(text);
  switch (task) {
    case "caption": {
      const caps = (j.captions ?? {}) as Record<string, unknown>;
      const captions: Partial<Record<Platform, string>> = {};
      for (const p of PLATFORMS) if (s(caps[p], 5000)) captions[p] = s(caps[p], 5000);
      if (!Object.keys(captions).length) throw new Error("The AI didn’t write any captions. Try again.");
      return { captions, hashtags: list(j.hashtags, 15, 60).map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")) } as CaptionResult;
    }
    case "ideas": {
      const ideas = (Array.isArray(j.ideas) ? j.ideas : []).slice(0, 12).map((x) => idea(x as Record<string, unknown>));
      if (!ideas.length) throw new Error("The AI didn’t suggest any ideas. Try again.");
      return { ideas };
    }
    case "plan": {
      const items: PlanItem[] = (Array.isArray(j.items) ? j.items : []).slice(0, 100).map((raw) => {
        const x = raw as Record<string, unknown>;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) ? String(x.date) : "";
        const m = /^(\d{1,2}):(\d{2})/.exec(String(x.time ?? ""));
        const time = m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, "0")}:${m[2]}` : "12:00";
        return { ...idea(x), date, time };
      }).filter((x) => x.date);
      if (!items.length) throw new Error("The AI didn’t return a plan. Try again.");
      return { items: items.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)) };
    }
    case "script": {
      const scenes = (Array.isArray(j.scenes) ? j.scenes : []).slice(0, 12)
        .map((raw) => ({ shot: s((raw as Record<string, unknown>).shot, 1000), line: s((raw as Record<string, unknown>).line, 600) }))
        .filter((x) => x.shot || x.line);
      if (!scenes.length) throw new Error("The AI didn’t write any scenes. Try again.");
      return { title: s(j.title, 120) || "New episode", scenes } as ScriptResult;
    }
    case "bible": {
      const b: BibleResult = {
        bio: s(j.bio, 500), backstory: s(j.backstory, 2000), traits: s(j.traits, 2000), world: s(j.world, 2000),
        voice: s(j.voice, 2000), catchphrases: list(j.catchphrases, 12, 200), dos: s(j.dos, 2000), donts: s(j.donts, 2000),
      };
      if (!b.bio && !b.backstory && !b.voice) throw new Error("The AI didn’t write a bible. Try again.");
      return b;
    }
    case "rewrite": {
      const t = s(j.text, 6000);
      if (!t) throw new Error("The AI didn’t return any text. Try again.");
      return { text: t };
    }
  }
}
