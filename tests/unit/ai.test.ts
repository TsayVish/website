import { test } from "node:test";
import assert from "node:assert/strict";
import { complete, fallbackCostCents, keyLooksRight, listModels, pickModel, AIError } from "../../lib/ai/providers.ts";
import { buildPrompt, characterBrief, extractJson, parseResult } from "../../lib/ai/tasks.ts";
import { runTask, saveKey, type AIEnv } from "../../lib/ai/run.ts";
import { seal, unseal } from "../../lib/social/secure.ts";

const bear = {
  name: "Burnout Bear", kind: "Animal", personality: "Anxious", description: "A bear in glasses who is always tired.",
  guide: { voice: "Dry, sleepy, self-aware", catchphrases: ["I’ll start Monday."], donts: "No energy drinks" },
};

function fakeFetch(routes: Record<string, (body: Record<string, unknown>, headers: Record<string, string>) => { status?: number; json: unknown }>) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const f = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, body, headers });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response("{}", { status: 404 });
    const r = routes[key](body, headers);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, calls };
}

test("prompts carry the character bible and the right JSON shape", () => {
  const brief = characterBrief(bear);
  assert.match(brief, /Name: Burnout Bear/);
  assert.match(brief, /Catchphrases: “I’ll start Monday\.”/);
  assert.doesNotMatch(brief, /Backstory/);
  const cap = buildPrompt("caption", bear, { brief: "Monday coffee", platforms: ["tiktok", "instagram", "myspace"] });
  assert.match(cap.system, /CHARACTER BIBLE/);
  assert.match(cap.prompt, /"tiktok": "\.\.\.", "instagram": "\.\.\."/);
  assert.doesNotMatch(cap.prompt, /myspace/);
  assert.throws(() => buildPrompt("caption", bear, {}), /Describe what the post/);
  assert.match(buildPrompt("ideas", bear, { count: 99 }).prompt, /Brainstorm 12 distinct/);
  assert.match(buildPrompt("plan", bear, { days: 14, perWeek: 4, start: "2026-10-19", timezone: "America/New_York" }).prompt, /14 days starting 2026-10-19, about 4 posts per week.*\n.*America\/New_York/);
  assert.match(buildPrompt("bible", bear, {}).system, /Develop and deepen/);
});

test("answers are parsed leniently and checked", () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"text": "hi"}\n```'), { text: "hi" });
  assert.throws(() => extractJson("no json here"), /expected format/);
  const cap = parseResult("caption", '{"captions": {"tiktok": " Coffee. ", "linkedin": "x"}, "hashtags": ["burnout", "#mondays", "too many words"]}');
  assert.deepEqual(cap, { captions: { tiktok: "Coffee." }, hashtags: ["#burnout", "#mondays", "#toomanywords"] });
  const plan = parseResult("plan", JSON.stringify({ items: [
    { date: "2026-10-20", time: "9:5", title: "b" },
    { date: "2026-10-19", time: "18:30", title: "a", format: "reel", platforms: ["tiktok", "x"] },
    { date: "soon", title: "dropped" },
  ] })) as { items: { date: string; time: string; title: string; format: string; platforms: string[] }[] };
  assert.deepEqual(plan.items.map((i) => [i.date, i.time, i.title, i.format]), [["2026-10-19", "18:30", "a", "reel"], ["2026-10-20", "12:00", "b", "post"]]);
  assert.deepEqual(plan.items[0].platforms, ["tiktok"]);
  const script = parseResult("script", '{"title": "Monday", "scenes": [{"shot": "Bear at desk", "line": "Ugh."}, {}]}') as { scenes: unknown[] };
  assert.equal(script.scenes.length, 1);
  assert.throws(() => parseResult("ideas", '{"ideas": []}'), /didn’t suggest/);
});

test("providers: Claude and OpenAI requests, models, errors", async () => {
  const { f, calls } = fakeFetch({
    "https://api.anthropic.com/v1/messages": () => ({ json: { content: [{ type: "text", text: '{"text":"hey"}' }], usage: { input_tokens: 120, output_tokens: 30 } } }),
    "https://api.openai.com/v1/chat/completions": () => ({ json: { choices: [{ message: { content: '{"text":"yo"}' } }], usage: { prompt_tokens: 100, completion_tokens: 20 } } }),
    "https://api.anthropic.com/v1/models": () => ({ json: { data: [{ id: "claude-opus-5-5" }, { id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }] } }),
    "https://api.openai.com/v1/models": () => ({ json: { data: [
      { id: "gpt-5-mini", created: 3 }, { id: "gpt-5", created: 2 }, { id: "whisper-1", created: 9 }, { id: "text-embedding-3", created: 8 }, { id: "gpt-realtime", created: 7 },
    ] } }),
  });
  const a = await complete({ provider: "anthropic", key: "sk-ant-x", model: "claude-sonnet-5-5", system: "S", prompt: "P", maxTokens: 100, fetch: f });
  assert.deepEqual(a, { text: '{"text":"hey"}', inputTokens: 120, outputTokens: 30 });
  assert.equal(calls[0].headers["x-api-key"], "sk-ant-x");
  assert.equal(calls[0].body.system, "S");
  const o = await complete({ provider: "openai", key: "sk-o", model: "gpt-5", system: "S", prompt: "P", maxTokens: 100, fetch: f });
  assert.equal(o.text, '{"text":"yo"}');
  assert.deepEqual(calls[1].body.messages, [{ role: "system", content: "S" }, { role: "user", content: "P" }]);
  assert.equal(calls[1].body.max_completion_tokens, 100);
  const am = await listModels("anthropic", "k", f);
  assert.equal(pickModel("anthropic", am), "claude-sonnet-5-5");
  const om = await listModels("openai", "k", f);
  assert.deepEqual(om, ["gpt-5-mini", "gpt-5"]);
  assert.equal(pickModel("openai", om), "gpt-5");
  const { f: bad } = fakeFetch({ "https://api.openai.com": () => ({ status: 401, json: { error: { message: "Incorrect API key" } } }) });
  await assert.rejects(listModels("openai", "k", bad), /rejected the API key/);
  assert.ok(keyLooksRight("anthropic", "sk-ant-api03-abcdefghijklmnop"));
  assert.ok(!keyLooksRight("anthropic", "sk-proj-abcdefghijklmnopqrst"));
  assert.ok(keyLooksRight("openai", "sk-proj-abcdefghijklmnopqrst"));
  assert.equal(fallbackCostCents("claude-sonnet-5-5", 1_000_000, 100_000), 300);
});

const env = (f: typeof fetch, extra: Partial<AIEnv> = {}): AIEnv => ({ tokenKey: "a-long-enough-test-key-1234567890", dbSecret: "db", fetch: f, ...extra });

function fakeDb(opts: { canEdit?: boolean; balance?: number; exempt?: boolean; keys?: { provider: string; key_enc: string; model: string }[] }) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const project = { id: "11111111-1111-4111-8111-111111111111", name: "Burnout Bear", type: "original", kind: "Animal", personality: "Anxious", description: null, style_guide: { voice: "Dry" } };
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: project }) }) }) }),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      rpcs.push({ fn, args });
      if (fn === "can_edit_project") return { data: opts.canEdit ?? true };
      if (fn === "credit_balance") return { data: opts.balance ?? 0 };
      if (fn === "is_billing_exempt") return { data: opts.exempt ?? false };
      if (fn === "ai_key_secret") return { data: opts.keys ?? [] };
      if (fn === "ai_record_run") return { data: args.p_own_key ? 0 : Math.max(1, Math.ceil(Number(args.p_cost_cents) * 1.5)) };
      return { data: null };
    },
  };
  return { db, rpcs, projectId: project.id };
}

test("runTask: uses your own key first, free", async () => {
  const { f, calls } = fakeFetch({ "https://api.openai.com/v1/chat/completions": () => ({ json: { choices: [{ message: { content: '{"text":"Coffee first."}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } }) });
  const e = env(f, { anthropicKey: "sk-ant-platform" });
  const { db, rpcs, projectId } = fakeDb({ keys: [{ provider: "openai", key_enc: seal(e, "sk-user-key-0000000000000"), model: "gpt-5" }] });
  const r = await runTask(db, db, e, "u1", { task: "rewrite", projectId, input: { text: "Coffee is first" } });
  assert.deepEqual(r.result, { text: "Coffee first." });
  assert.deepEqual(r.usage, { provider: "openai", model: "gpt-5", ownKey: true, chargedCents: 0 });
  assert.equal(calls[0].headers.Authorization, "Bearer sk-user-key-0000000000000");
  assert.ok(!rpcs.some((x) => x.fn === "credit_balance"), "no credit check with your own key");
});

test("runTask: falls back to credits, and stops when there aren't any", async () => {
  const { f, calls } = fakeFetch({ "https://api.anthropic.com/v1/messages": () => ({ json: { content: [{ type: "text", text: '{"ideas":[{"title":"Nap club","hook":"Join me","format":"reel","platforms":["tiktok"],"caption":"zzz"}]}' }], usage: { input_tokens: 2000, output_tokens: 800 } } }) });
  const e = env(f, { anthropicKey: "sk-ant-platform" });
  const ok = fakeDb({ balance: 50 });
  const r = await runTask(ok.db, ok.db, e, "u1", { task: "ideas", projectId: ok.projectId, input: { count: 1 } });
  assert.equal((r.result as { ideas: unknown[] }).ideas.length, 1);
  assert.equal(r.usage.ownKey, false);
  assert.equal(calls[0].headers["x-api-key"], "sk-ant-platform");
  const rec = ok.rpcs.find((x) => x.fn === "ai_record_run")!;
  assert.equal(rec.args.p_cost_cents, fallbackCostCents("claude-sonnet-5-5", 2000, 800));
  assert.equal(r.usage.chargedCents, 2);

  const broke = fakeDb({ balance: 1 });
  await assert.rejects(runTask(broke.db, broke.db, e, "u1", { task: "ideas", projectId: broke.projectId }), (err: unknown) => err instanceof AIError && err.status === 402);
  const free = fakeDb({ balance: 0, exempt: true });
  await runTask(free.db, free.db, e, "u1", { task: "ideas", projectId: free.projectId });
  const nokey = fakeDb({ balance: 100 });
  await assert.rejects(runTask(nokey.db, nokey.db, env(f), "u1", { task: "ideas", projectId: nokey.projectId }), /Add your own Claude or OpenAI API key/);
  const viewer = fakeDb({ canEdit: false, balance: 100 });
  await assert.rejects(runTask(viewer.db, viewer.db, e, "u1", { task: "ideas", projectId: viewer.projectId }), /owner or editors/);
  await assert.rejects(runTask(ok.db, ok.db, e, "u1", { task: "hack" as never, projectId: ok.projectId }), /Unknown AI tool/);
});

test("saveKey: verifies with the provider and stores it encrypted", async () => {
  const { f } = fakeFetch({ "https://api.anthropic.com/v1/models": () => ({ json: { data: [{ id: "claude-haiku-5-5" }, { id: "claude-sonnet-5-5" }] } }) });
  const e = env(f);
  const { db, rpcs } = fakeDb({});
  const r = await saveKey(db, e, "anthropic", "  sk-ant-api03-userkey123456789  ");
  assert.equal(r.model, "claude-sonnet-5-5");
  const saved = rpcs.find((x) => x.fn === "ai_save_key")!.args;
  assert.equal(saved.p_hint, "…6789");
  assert.equal(unseal(e, saved.p_key_enc as string), "sk-ant-api03-userkey123456789");
  assert.ok(!String(saved.p_key_enc).includes("userkey"));
  await assert.rejects(saveKey(db, e, "anthropic", "sk-proj-wrongprovider000000"), /start with sk-ant-/);
});
