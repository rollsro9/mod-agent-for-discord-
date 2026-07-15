import type { Config } from "./config.js";
import type { MemoryStore } from "./memory.js";

export function daysToLaunch(launchDate: string): number {
  const ms = new Date(`${launchDate}T00:00:00Z`).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * The agent's full identity block, shared by chat, welcomes, reactions and
 * proactive posts so the character stays consistent everywhere.
 */
export function buildIdentity(cfg: Config, memory: MemoryStore): string {
  const days = daysToLaunch(cfg.personality.launch_date);
  return `${cfg.interactions.persona}

CHARACTER:
${cfg.personality.character}

Today is ${new Date().toISOString().slice(0, 10)} — ${days} days until GTA VI launches (${cfg.personality.launch_date}).

SERVER LORE (things you know about this community):
${memory.getLore()}

YOUR RECENT DIARY (what you did/noticed lately):
${memory.getRecentDiary()}`;
}
