import type { Message } from "discord.js";
import type { Config } from "../config.js";
import type { LlmClient } from "../llm/client.js";
import type { ChatMessage } from "../llm/provider.js";

/**
 * Member-facing chat: replies to @mentions/replies anywhere, and to plain
 * questions in the configured general channels. Cooldowns keep costs bounded.
 */
export class ChatResponder {
  private userLastReply = new Map<string, number>();
  private channelLastReply = new Map<string, number>();

  constructor(
    private cfg: Config["interactions"],
    private generalChannelIds: string[],
    private llm: LlmClient,
  ) {}

  private buildSystem(): string {
    const faq = Object.entries(this.cfg.faq)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    return `${this.cfg.persona}

Known facts (prefer these over your own knowledge when relevant):
${faq || "- (none)"}

Rules:
- Keep replies short (2-4 sentences), Discord-casual, no markdown headers.
- If you don't know, say so and suggest asking in the channel.
- Never invent release dates, links or leak content. Never link leaked files/footage.`;
  }

  /** Decides for free (no LLM call) whether this message deserves a reply. */
  shouldRespond(message: Message, botUserId: string): boolean {
    const now = Date.now();
    const isMention =
      this.cfg.respond_to_mentions &&
      (message.mentions.users.has(botUserId) ||
        message.mentions.repliedUser?.id === botUserId);

    const isGeneralQuestion =
      this.cfg.respond_in_general &&
      this.generalChannelIds.includes(message.channelId) &&
      /\?\s*$/.test(message.content) &&
      message.content.length > 10 &&
      now - (this.channelLastReply.get(message.channelId) ?? 0) >
        this.cfg.channel_cooldown_seconds * 1000;

    if (!isMention && !isGeneralQuestion) return false;

    // Mentions bypass the channel cooldown but respect the per-user one.
    const lastUser = this.userLastReply.get(message.author.id) ?? 0;
    return now - lastUser > this.cfg.user_cooldown_seconds * 1000;
  }

  async respond(message: Message, botUserId: string): Promise<void> {
    // Recent channel context so answers fit the ongoing conversation
    const recent = await message.channel.messages.fetch({
      limit: this.cfg.context_messages,
      before: message.id,
    });
    const context: ChatMessage[] = [...recent.values()]
      .reverse()
      .filter((m) => m.content)
      .map((m) => ({
        role: m.author.id === botUserId ? ("assistant" as const) : ("user" as const),
        content: `${m.author.id === botUserId ? "" : m.author.displayName + ": "}${m.content.slice(0, 400)}`,
      }));
    context.push({
      role: "user",
      content: `${message.author.displayName}: ${message.content.slice(0, 800)}`,
    });

    // OpenAI-compatible APIs reject consecutive same-role messages less often
    // than Anthropic does — merge runs to be safe for both providers.
    const merged: ChatMessage[] = [];
    for (const m of context) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.content += `\n${m.content}`;
      else merged.push({ ...m });
    }
    if (merged[0]?.role === "assistant") merged.shift();

    const result = await this.llm.complete("chat", this.buildSystem(), merged, 512);
    if (!result?.text) return;

    this.userLastReply.set(message.author.id, Date.now());
    this.channelLastReply.set(message.channelId, Date.now());
    await message.reply({ content: result.text.slice(0, 2000), allowedMentions: { repliedUser: true } });
  }
}
