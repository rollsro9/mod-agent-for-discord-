import { z } from "zod";
import type { LlmClient } from "../llm/client.js";
import { extractJson } from "../llm/provider.js";

export const Verdict = z.object({
  category: z.enum(["ok", "spam", "scam", "harassment", "leak_file_sharing", "toxicity", "other"]),
  severity: z.enum(["none", "low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type Verdict = z.infer<typeof Verdict>;

const SYSTEM = `You are the moderation classifier of a GTA VI fan Discord server (news, leak discussion, mapping). Discussing leak NEWS is allowed; posting or linking leaked FILES/FOOTAGE is not.

Classify the message. Respond with ONLY a JSON object:
{"category": "ok|spam|scam|harassment|leak_file_sharing|toxicity|other", "severity": "none|low|medium|high", "confidence": 0.0-1.0, "reason": "one short sentence"}

Guidance:
- scam = phishing, fake nitro/giveaways, account selling, malware links -> usually high severity
- spam = unsolicited invites/ads, mass mentions
- leak_file_sharing = links or offers to download leaked game files or footage
- Gaming slang, banter and mild profanity between members is "ok". Do not over-flag.`;

export async function classify(
  llm: LlmClient,
  content: string,
  authorTag: string,
  channelName: string,
): Promise<Verdict | null> {
  const result = await llm.complete("classifier", SYSTEM, [
    {
      role: "user",
      content: `Channel: #${channelName}\nAuthor: ${authorTag}\nMessage:\n${content.slice(0, 1500)}`,
    },
  ], 256);
  if (!result) return null;
  try {
    return Verdict.parse(extractJson(result.text));
  } catch {
    return null; // unparseable verdict -> treat as no verdict, prefilter flag still posted
  }
}
