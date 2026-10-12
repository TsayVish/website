/*
 * Talking to Claude (Anthropic) and OpenAI over their HTTP APIs. Server-only: keys never reach the browser.
 */

export type AIProvider = "anthropic" | "openai";
export const AI_PROVIDERS: AIProvider[] = ["anthropic", "openai"];
export const PROVIDER_LABEL: Record<AIProvider, string> = { anthropic: "Claude (Anthropic)", openai: "OpenAI" };

export class AIError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export type Completion = { text: string; inputTokens: number; outputTokens: number };
type Req = { provider: AIProvider; key: string; model: string; system: string; prompt: string; maxTokens: number; fetch?: typeof fetch };

const ANTHROPIC = "https://api.anthropic.com/v1";
const OPENAI = "https://api.openai.com/v1";

async function send(f: typeof fetch, provider: AIProvider, url: string, init: RequestInit) {
  const label = provider === "anthropic" ? "Claude" : "OpenAI";
  let res: Response;
  try { res = await f(url, init); } catch { throw new AIError(`Couldn’t reach ${label}. Try again.`, 502); }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { message?: string; type?: string } | undefined;
    const msg = err?.message ?? `status ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new AIError(`${label} rejected the API key. Check it in Settings → AI.`, 400);
    if (res.status === 429) throw new AIError(`${label} is rate-limiting this key or it’s out of credit: ${msg}`, 429);
    if (res.status === 404) throw new AIError(`${label} doesn’t offer that model to this key. Pick another in Settings → AI.`, 400);
    throw new AIError(`${label}: ${msg}`.slice(0, 300), res.status >= 500 ? 502 : 400);
  }
  return body;
}

export async function complete(r: Req): Promise<Completion> {
  const f = r.fetch ?? fetch;
  if (r.provider === "anthropic") {
    const b = await send(f, "anthropic", `${ANTHROPIC}/messages`, {
      method: "POST",
      headers: { "x-api-key": r.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: r.model, max_tokens: r.maxTokens, system: r.system, messages: [{ role: "user", content: r.prompt }] }),
    });
    const text = ((b.content ?? []) as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const u = (b.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
    return { text, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
  }
  const b = await send(f, "openai", `${OPENAI}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${r.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: r.model, max_completion_tokens: r.maxTokens,
      messages: [{ role: "system", content: r.system }, { role: "user", content: r.prompt }],
    }),
  });
  const choice = ((b.choices ?? []) as { message?: { content?: string } }[])[0];
  const u = (b.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  return { text: choice?.message?.content ?? "", inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
}

const OPENAI_SKIP = /(audio|realtime|transcribe|tts|image|search|embedding|instruct|moderation|dall-e|whisper|codex|computer)/i;

/** Text models this key can use, newest first. Also proves the key works. */
export async function listModels(provider: AIProvider, key: string, f: typeof fetch = fetch): Promise<string[]> {
  if (provider === "anthropic") {
    const b = await send(f, "anthropic", `${ANTHROPIC}/models?limit=100`, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    return ((b.data ?? []) as { id: string }[]).map((m) => m.id).filter((id) => id.startsWith("claude-"));
  }
  const b = await send(f, "openai", `${OPENAI}/models`, { headers: { Authorization: `Bearer ${key}` } });
  return ((b.data ?? []) as { id: string; created?: number }[])
    .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !OPENAI_SKIP.test(m.id))
    .sort((a, b2) => (b2.created ?? 0) - (a.created ?? 0))
    .map((m) => m.id);
}

/** A sensible default: a mid-sized current model. */
export function pickModel(provider: AIProvider, models: string[]) {
  if (!models.length) return null;
  if (provider === "anthropic") return models.find((m) => m.includes("sonnet")) ?? models[0];
  return models.find((m) => /^gpt-\d/.test(m) && !/(mini|nano)/.test(m)) ?? models[0];
}

/** tsayvish's own key (used when someone hasn't added theirs): price per million tokens, in dollars. */
const FALLBACK_PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /opus/, input: 4, output: 20 },
  { match: /haiku/, input: 0.1, output: 0.5 },
  { match: /sonnet/, input: 2, output: 10 },
];
export function fallbackCostCents(model: string, inputTokens: number, outputTokens: number) {
  const p = FALLBACK_PRICES.find((x) => x.match.test(model)) ?? FALLBACK_PRICES[2];
  return ((inputTokens * p.input + outputTokens * p.output) / 1e6) * 100;
}

export const keyHint = (key: string) => `…${key.trim().slice(-4)}`;
export function keyLooksRight(provider: AIProvider, key: string) {
  const k = key.trim();
  if (k.length < 20 || /\s/.test(k)) return false;
  return provider === "anthropic" ? k.startsWith("sk-ant-") : k.startsWith("sk-");
}
