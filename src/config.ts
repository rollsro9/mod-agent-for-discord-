import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const ConfigSchema = z.object({
  server: z.object({
    mod_channel_id: z.string().min(1),
    welcome_channel_id: z.string().default(""),
    general_channel_ids: z.array(z.string()).default([]),
  }),
  llm: z.object({
    provider: z.enum(["glm", "anthropic"]).default("glm"),
    // Only used by the glm / OpenAI-compatible provider
    base_url: z.string().default("https://open.bigmodel.cn/api/paas/v4"),
    models: z.object({
      classifier: z.string(),
      chat: z.string(),
      escalation: z.string(),
      digest: z.string(),
    }),
    // USD per million tokens, used by the budget tracker
    pricing: z
      .record(z.object({ input: z.number(), output: z.number() }))
      .default({}),
  }),
  moderation: z.object({
    prefilter_patterns: z.array(z.string()).default([]),
    max_mentions: z.number().int().positive().default(5),
    // Severity at or above which the escalation model reviews the case
    escalate_severity: z.enum(["low", "medium", "high"]).default("high"),
  }),
  interactions: z.object({
    respond_to_mentions: z.boolean().default(true),
    respond_in_general: z.boolean().default(true),
    user_cooldown_seconds: z.number().int().min(0).default(30),
    channel_cooldown_seconds: z.number().int().min(0).default(120),
    context_messages: z.number().int().min(0).max(25).default(10),
    welcome_enabled: z.boolean().default(true),
    persona: z.string().default("You are a helpful Discord community assistant."),
    faq: z.record(z.string()).default({}),
  }),
  digest: z.object({
    enabled: z.boolean().default(true),
    post_hour_utc: z.number().int().min(0).max(23).default(21),
  }),
  budget: z.object({
    daily_usd_cap: z.number().positive().default(0.5),
    warn_fraction: z.number().min(0).max(1).default(0.8),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(file = "config.yaml"): Config {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing ${file}. Copy config.example.yaml to config.yaml and edit it.`,
    );
  }
  return ConfigSchema.parse(parse(fs.readFileSync(p, "utf8")));
}
