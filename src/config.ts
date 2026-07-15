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
  personality: z.object({
    character: z.string().default("You are a passionate GTA VI superfan."),
    launch_date: z.string().default("2026-11-19"),
  }),
  memory: z.object({
    data_dir: z.string().default("data"),
    member_memory_max_chars: z.number().int().positive().default(2000),
    // After replying to someone, ask the cheap model if anything is worth remembering
    learn_about_members: z.boolean().default(true),
  }),
  proactive: z.object({
    enabled: z.boolean().default(false),
    channel_id: z.string().default(""),
    min_hours_between: z.number().positive().default(6),
    max_hours_between: z.number().positive().default(18),
    // [from, to) UTC hours in which spontaneous posts are allowed
    active_hours_utc: z.tuple([z.number().int().min(0).max(23), z.number().int().min(0).max(23)]).default([9, 23]),
    daily_max: z.number().int().min(0).default(3),
  }),
  reactions: z.object({
    enabled: z.boolean().default(true),
    probability: z.number().min(0).max(1).default(0.08),
    daily_max: z.number().int().min(0).default(30),
  }),
  digest: z.object({
    enabled: z.boolean().default(true),
    post_hour_utc: z.number().int().min(0).max(23).default(21),
  }),
  news: z.object({
    enabled: z.boolean().default(false),
    channel_id: z.string().default(""),
    post_hour_utc: z.number().int().min(0).max(23).default(10),
    // RSS/Atom feeds to pull once a day
    sources: z.array(z.string()).default([]),
    max_items_per_source: z.number().int().positive().default(10),
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
