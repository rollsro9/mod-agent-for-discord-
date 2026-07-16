import "dotenv/config";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Message,
  type TextChannel,
} from "discord.js";
import { loadConfig } from "./config.js";
import { BudgetTracker } from "./budget.js";
import { LlmClient } from "./llm/client.js";
import { Prefilter } from "./moderation/prefilter.js";
import { classify } from "./moderation/classifier.js";
import { escalate } from "./moderation/escalation.js";
import { postFlag } from "./moderation/flagger.js";
import { ChatResponder } from "./interactions/chat.js";
import { Welcomer } from "./interactions/welcome.js";
import { Reactor } from "./interactions/reactions.js";
import { DigestCollector } from "./digest.js";
import { MemoryStore } from "./memory.js";
import { NewsWatcher } from "./news.js";
import { ProactiveEngine } from "./proactive.js";
import { buildIdentity } from "./persona.js";

const cfg = loadConfig();
const budget = new BudgetTracker(cfg.budget, cfg.llm.pricing);
const llm = new LlmClient(cfg.llm, budget);
const memory = new MemoryStore(cfg.memory.data_dir, cfg.memory.member_memory_max_chars);
const prefilter = new Prefilter(cfg.moderation);
const chat = new ChatResponder(cfg, llm, memory);
const welcomer = new Welcomer(cfg, llm, memory);
const reactor = new Reactor(cfg.reactions, llm, () => buildIdentity(cfg, memory));
const digest = new DigestCollector(cfg.digest, llm, budget, memory);

const SEVERITY_RANK = { none: 0, low: 1, medium: 2, high: 3 } as const;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

let modChannel: TextChannel | null = null;

async function verifyChannelPermissions(
  c: Client,
  channelId: string | undefined,
  purpose: string,
  required: bigint[] = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
) {
  if (!channelId) return;
  try {
    const ch = await c.channels.fetch(channelId);
    if (!ch) {
      console.warn(`[PermsCheck] Channel ${channelId} for ${purpose} not found.`);
      void modChannel?.send(`⚠️ [PermsCheck] Channel <#${channelId}> for **${purpose}** was not found.`);
      return;
    }
    if ('permissionsFor' in ch && ch.permissionsFor) {
      const perms = ch.permissionsFor(c.user!);
      if (!perms) {
        console.warn(`[PermsCheck] Could not resolve permissions for channel ${ch.id} (${purpose}).`);
        return;
      }
      const missing: string[] = [];
      for (const req of required) {
        if (!perms.has(req)) {
          const name = Object.keys(PermissionFlagsBits).find(
            (k) => (PermissionFlagsBits as any)[k] === req
          ) ?? req.toString();
          missing.push(name);
        }
      }
      if (missing.length > 0) {
        const msg = `⚠️ [PermsCheck] Bot is missing permissions in <#${ch.id}> (${purpose}): ${missing.join(", ")}`;
        console.warn(msg);
        void modChannel?.send(msg);
      } else {
        console.log(`[PermsCheck] Channel <#${ch.id}> (${purpose}) OK.`);
      }
    }
  } catch (err) {
    console.error(`[PermsCheck] Error verifying permissions for ${channelId} (${purpose}):`, err);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  const ch = await c.channels.fetch(cfg.server.mod_channel_id);
  if (!ch || ch.type !== ChannelType.GuildText) {
    throw new Error("mod_channel_id does not point to a text channel");
  }
  modChannel = ch;

  budget.onWarn = (spent, cap) =>
    void modChannel?.send(`⚠️ LLM budget at $${spent.toFixed(2)} of $${cap.toFixed(2)} daily cap.`);
  budget.onExhausted = (spent, cap) =>
    void modChannel?.send(
      `🛑 Daily LLM budget exhausted ($${spent.toFixed(2)}/$${cap.toFixed(2)}). ` +
        `Falling back to regex-only flagging until midnight UTC.`,
    );

  // Verify permissions for key channels
  await verifyChannelPermissions(c, cfg.server.mod_channel_id, "moderator logs");
  await verifyChannelPermissions(c, cfg.server.welcome_channel_id, "welcome messages");
  await verifyChannelPermissions(c, cfg.news.channel_id, "news updates");
  if (cfg.proactive.enabled) {
    await verifyChannelPermissions(c, cfg.proactive.channel_id, "proactive engine");
  }
  for (const gcId of cfg.server.general_channel_ids) {
    await verifyChannelPermissions(c, gcId, "general chat and reactions");
  }

  const news = new NewsWatcher(cfg.news, cfg, llm, memory, c);
  setInterval(() => {
    if (modChannel) void digest.tick(modChannel).catch(console.error);
    void news.tick().catch(console.error);
  }, 60_000);

  new ProactiveEngine(cfg.proactive, cfg, llm, memory, c).start();
});

async function fetchChannelContext(message: Message, botUserId: string): Promise<string> {
  const recent = await message.channel.messages.fetch({ limit: 10, before: message.id });
  return [...recent.values()]
    .reverse()
    .map((m) => `${m.author.id === botUserId ? "[bot]" : m.author.displayName}: ${m.content.slice(0, 200)}`)
    .join("\n");
}

async function handleModeration(message: Message, reason: string): Promise<boolean> {
  if (!modChannel) return false;
  const channelName = "name" in message.channel ? (message.channel.name ?? "?") : "?";

  const verdict = await classify(llm, message.content, message.author.tag, channelName);

  // Classifier confidently says clean -> drop the pre-filter false positive quietly
  if (verdict && verdict.category === "ok" && verdict.confidence >= 0.8) return false;

  let escalationReport: string | null = null;
  if (
    verdict &&
    SEVERITY_RANK[verdict.severity] >= SEVERITY_RANK[cfg.moderation.escalate_severity]
  ) {
    const context = await fetchChannelContext(message, client.user!.id);
    escalationReport = await escalate(llm, verdict, message.content, message.author.tag, context);
  }

  await postFlag(modChannel, message, reason, verdict, escalationReport);
  digest.recordFlag(
    `${message.author.tag} in #${channelName}: ${verdict ? `${verdict.category}/${verdict.severity}` : "prefilter"} — ${(verdict?.reason ?? reason).slice(0, 100)}`,
  );
  return true;
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;
  if (message.channelId === cfg.server.mod_channel_id) return; // never process staff channel

  // Developer command: Test welcome logic
  if (message.content === "!testwelcome" && message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    try {
      if (cfg.interactions.welcome_enabled && cfg.server.welcome_channel_id) {
        const ch = await message.guild.channels.fetch(cfg.server.welcome_channel_id);
        if (ch?.type === ChannelType.GuildText) {
          await welcomer.welcome(message.member, ch);
          await message.reply("Simulated welcome message sent!");
        } else {
          await message.reply("Welcome channel is not a text channel or not found.");
        }
      } else {
        await message.reply("Welcome is disabled or welcome_channel_id is not set in config.");
      }
    } catch (err) {
      console.error("!testwelcome command error:", err);
      await message.reply(`Error running test: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  const channelName = "name" in message.channel ? (message.channel.name ?? "?") : "?";
  digest.recordMessage(channelName);

  try {
    // Moderation first: a suspicious message gets flagged, not answered
    const reason = prefilter.match(message);
    if (reason) {
      const flagged = await handleModeration(message, reason);
      if (flagged) return;
    }

    if (chat.shouldRespond(message, client.user!.id)) {
      await chat.respond(message, client.user!.id);
      digest.recordBotReply();
      return;
    }

    // Occasionally react with an emoji in the general channels
    if (cfg.server.general_channel_ids.includes(message.channelId)) {
      await reactor.maybeReact(message);
    }
  } catch (err) {
    console.error("messageCreate handler error:", err);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  digest.recordJoin(member.user.tag);
  if (!cfg.interactions.welcome_enabled || !cfg.server.welcome_channel_id) return;
  try {
    const ch = await member.guild.channels.fetch(cfg.server.welcome_channel_id);
    if (ch?.type === ChannelType.GuildText) await welcomer.welcome(member, ch);
  } catch (err) {
    console.error("guildMemberAdd handler error:", err);
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN not set");
void client.login(token);
