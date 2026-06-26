// An LLM-backed mind: drive a bee by asking an OpenAI-compatible endpoint to pick one
// action. Everything the bee "authors" (a child's goal, its result) is just arguments
// of the action it chooses — so the mind has exactly one job: decide.
//
// Configuration is per-instance (resolved in the factory, env as defaults), so different
// bees can run different models: `llmMind({ model: "..." })`.
import type { ActionView, Decision, Mind } from "../framework/types.ts";
import { extractJson } from "./json.ts";

const DEFAULT_SYSTEM = `You are one bee operating inside one cell of an agent run.
You see the cell, your goal, results returned by your sub-bees, your notes, and the actions available.

Reply with EXACTLY ONE JSON object and no prose:
{"action": "<name>", "<field>": <value>, ...}

Use only currently available actions. To finish, call "resolve" with an "outcome"
and a "summary" that answers your goal.`;

type FetchFn = typeof fetch;

export interface LlmMindOptions {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
  fetch?: FetchFn;
  onRaw?: (raw: string, decision: Decision | null) => void;
}

interface ResolvedConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  system: string;
  fetchImpl: FetchFn;
}

export function llmMind(opts: LlmMindOptions = {}): Mind {
  const cfg: ResolvedConfig = {
    baseUrl: opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? "http://localhost:8080/v1",
    model: opts.model ?? process.env.SKEP_MODEL ?? "local-model",
    apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY,
    temperature: opts.temperature ?? 0.2,
    maxTokens: opts.maxTokens ?? 512,
    system: opts.system ?? DEFAULT_SYSTEM,
    fetchImpl: opts.fetch ?? fetch,
  };

  return {
    async decide({ view, actions }) {
      let raw = await complete(cfg, view);
      let decision = parse(raw, actions);
      if (!decision) {
        raw = await complete(cfg, view + "\n\nYour last reply was not one valid JSON action. Reply with ONLY a JSON object.");
        decision = parse(raw, actions);
      }
      opts.onRaw?.(raw, decision);
      return decision ?? { action: "resolve", args: { outcome: "blocked", summary: "No valid action was produced." } };
    },
  };
}

function parse(raw: string, actions: ActionView[]): Decision | null {
  const json = extractJson(raw);
  const name = json?.action;
  if (typeof name !== "string") return null;
  const view = actions.find((a) => a.name === name);
  const args: Record<string, unknown> = {};
  for (const field of view?.input ?? []) {
    if (json[field.name] !== undefined) args[field.name] = json[field.name];
  }
  return { action: name, args };
}

async function complete(cfg: ResolvedConfig, user: string): Promise<string> {
  const url = `${cfg.baseUrl}/chat/completions`;
  let response: Response;
  try {
    response = await cfg.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: cfg.system.trim() },
          { role: "user", content: user.trim() },
        ],
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
      }),
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`completion fetch failed for ${url} (${cause}). Set OPENAI_BASE_URL or pass baseUrl to llmMind().`);
  }

  if (!response.ok) {
    throw new Error(`completion failed: ${response.status} ${await response.text()}`);
  }

  const body: any = await response.json();
  return (body.choices ?? [])
    .map((choice: any) => choice.message?.content ?? choice.text ?? "")
    .join("");
}
