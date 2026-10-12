/*
 * Runs one AI writing task for the signed-in person: their own API key if they've added
 * one, otherwise tsayvish's key paid for from their credits. No Next.js imports, so it's testable.
 */
import { readStyleGuide } from "../characters";
import { seal, unseal, type SocialEnv } from "../social/secure";
import { AIError, complete, fallbackCostCents, keyHint, keyLooksRight, listModels, pickModel, type AIProvider } from "./providers";
import { buildPrompt, parseResult, TASKS, type TaskName } from "./tasks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type AIEnv = SocialEnv & { anthropicKey?: string; fallbackModel?: string };

export function aiEnv(base: SocialEnv): AIEnv {
  return { ...base, anthropicKey: process.env.ANTHROPIC_API_KEY || undefined, fallbackModel: process.env.AI_FALLBACK_MODEL || undefined };
}

const UUID = /^[0-9a-f-]{36}$/i;
const MIN_CREDITS = 2; // cents needed in the balance before using tsayvish's key

export type Credentials = { provider: AIProvider; key: string; model: string; own: boolean };

/** Which key a request will use. */
export async function credentialsFor(db: Db, pub: Db, env: AIEnv, uid: string): Promise<Credentials> {
  if (env.dbSecret && env.tokenKey) {
    const { data, error } = await pub.rpc("ai_key_secret", { p_secret: env.dbSecret, p_user: uid });
    if (error) console.error("[ai] key lookup", error.message);
    const row = ((data ?? []) as { provider: AIProvider; key_enc: string; model: string | null }[])[0];
    if (row) {
      const key = unseal(env, row.key_enc);
      if (key) {
        if (!row.model) throw new AIError("Pick a model for your key in Settings → AI.");
        return { provider: row.provider, key, model: row.model, own: true };
      }
    }
  }
  if (!env.anthropicKey) throw new AIError("Add your own Claude or OpenAI API key in Settings → AI to use the writing tools.", 400);
  const [{ data: exempt }, { data: balance }] = await Promise.all([db.rpc("is_billing_exempt"), db.rpc("credit_balance")]);
  if (exempt !== true && (typeof balance !== "number" || balance < MIN_CREDITS)) {
    throw new AIError("You’re out of credits. Add credits, or add your own Claude or OpenAI key in Settings → AI.", 402);
  }
  return { provider: "anthropic", key: env.anthropicKey, model: env.fallbackModel || "claude-sonnet-5-5", own: false };
}

export type RunBody = { task: TaskName; projectId: string; input?: Record<string, unknown> };

export async function runTask(db: Db, pub: Db, env: AIEnv, uid: string, body: RunBody) {
  if (!body || !TASKS.includes(body.task)) throw new AIError("Unknown AI tool.");
  if (!UUID.test(body.projectId ?? "")) throw new AIError("Pick a character first.");
  const { data: project } = await db.from("projects").select("id, name, type, kind, personality, description, style_guide").eq("id", body.projectId).maybeSingle();
  if (!project || project.type !== "original") throw new AIError("Character not found.", 404);
  const { data: canEdit } = await db.rpc("can_edit_project", { pid: project.id });
  if (canEdit !== true) throw new AIError("Only the character’s owner or editors can use the AI tools.", 403);

  let built;
  try {
    built = buildPrompt(body.task, {
      name: project.name, kind: project.kind, personality: project.personality, description: project.description,
      guide: readStyleGuide(project.style_guide),
    }, body.input ?? {});
  } catch (e) {
    throw new AIError(e instanceof Error ? e.message : "Check what you entered.");
  }

  const cred = await credentialsFor(db, pub, env, uid);
  const out = await complete({ ...built, provider: cred.provider, key: cred.key, model: cred.model, fetch: env.fetch });
  const cost = cred.own ? 0 : fallbackCostCents(cred.model, out.inputTokens, out.outputTokens);
  const { data: charged, error } = await db.rpc("ai_record_run", {
    p_project: project.id, p_task: body.task, p_provider: cred.provider, p_model: cred.model, p_own_key: cred.own,
    p_input_tokens: out.inputTokens, p_output_tokens: out.outputTokens, p_cost_cents: cost,
  });
  if (error) console.error("[ai] record", error.message);
  let result;
  try {
    result = parseResult(body.task, out.text);
  } catch (e) {
    throw new AIError(e instanceof Error ? e.message : "Try again.", 502);
  }
  return { result, usage: { provider: cred.provider, model: cred.model, ownKey: cred.own, chargedCents: typeof charged === "number" ? charged : 0 } };
}

/** Checks a key with the provider, then stores it encrypted. Returns the models it can use. */
export async function saveKey(db: Db, env: AIEnv, provider: AIProvider, key: string) {
  if (provider !== "anthropic" && provider !== "openai") throw new AIError("Unknown provider.");
  const k = String(key ?? "").trim();
  if (!keyLooksRight(provider, k)) {
    throw new AIError(provider === "anthropic" ? "That doesn’t look like a Claude API key (they start with sk-ant-)." : "That doesn’t look like an OpenAI API key (they start with sk-).");
  }
  if (!env.tokenKey) throw new AIError("Saving keys isn’t set up yet (SOCIAL_TOKEN_KEY).", 503);
  const models = await listModels(provider, k, env.fetch ?? fetch);
  const model = pickModel(provider, models);
  if (!model) throw new AIError("That key works but has no text models available.");
  const { error } = await db.rpc("ai_save_key", { p_provider: provider, p_key_enc: seal(env, k), p_hint: keyHint(k), p_model: model });
  if (error) throw new AIError(error.message);
  return { model, models: models.slice(0, 40) };
}

/** Models available to one of the person's saved keys. */
export async function modelsFor(pub: Db, env: AIEnv, uid: string, provider: AIProvider) {
  const { data } = await pub.rpc("ai_key_secret", { p_secret: env.dbSecret, p_user: uid });
  const row = ((data ?? []) as { provider: AIProvider; key_enc: string }[]).find((r) => r.provider === provider);
  if (!row) throw new AIError("Add that key first.", 404);
  return listModels(provider, unseal(env, row.key_enc)!, env.fetch ?? fetch);
}
