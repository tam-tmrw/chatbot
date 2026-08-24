import type { IncomingMessage, OutgoingMessage } from "@/lib/channels/types";
import { joinBubbles, parseBubbles } from "@/lib/conversation/bubbles";
import {
  extractLeadProfile,
  leadSummary,
  missingLeadFields,
  validationIssues,
  validationReask,
} from "@/lib/conversation/profile";
import { buildSystemPrompt } from "@/lib/conversation/prompt";
import {
  appendMessage,
  getOrCreateSession,
  getOrCreateSessionByChannelUser,
  loadRecentMessages,
} from "@/lib/conversation/session";
import { getLeadForSession, upsertLeadForSession } from "@/lib/leads/service";
import { getLlmProvider, type LlmProvider } from "@/lib/llm";
import type { ChatMessage } from "@/lib/llm/types";

const FALLBACK =
  "Mạng hơi chậm một nhịp. Bạn nhắn lại giúp mình nhé — mình vẫn ở đây.";

const DEFAULT_LLM_TIMEOUT_MS = 10_000;

async function chatWithTimeout(
  llm: LlmProvider,
  messages: ChatMessage[],
  ms: number,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM timeout")), ms);
  });
  try {
    return await Promise.race([llm.chat(messages), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function out(
  sessionId: string,
  texts: string[],
  leadCaptured: boolean,
): OutgoingMessage {
  return {
    sessionId,
    texts,
    text: joinBubbles(texts),
    leadCaptured,
  };
}

export async function handleTurn(
  input: IncomingMessage,
  deps?: { llm?: LlmProvider; llmTimeoutMs?: number },
): Promise<OutgoingMessage> {
  const sessionId =
    input.channel === "messenger"
      ? await getOrCreateSessionByChannelUser(
          input.channel,
          input.channelUserId,
        )
      : await getOrCreateSession(
          input.sessionId,
          input.channel,
          input.channelUserId,
        );
  await appendMessage(sessionId, "user", input.text);

  const history = await loadRecentMessages(sessionId, 12);
  const userTexts = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const extracted = extractLeadProfile(userTexts);
  const stored = await getLeadForSession(sessionId);
  const profile = {
    name: extracted.name ?? stored?.name ?? null,
    region: extracted.region ?? stored?.region ?? null,
    finance: extracted.finance ?? stored?.finance ?? null,
    phone: extracted.phone ?? stored?.phone ?? null,
  };
  const missing = missingLeadFields(profile);
  let issues = validationIssues(input.text, missing[0] === "region");
  if (profile.phone) issues = issues.filter((i) => i !== "phone");
  if (profile.region) issues = issues.filter((i) => i !== "region");

  if (profile.phone || profile.name || profile.region || profile.finance) {
    await upsertLeadForSession({
      sessionId,
      phone: profile.phone,
      name: profile.name,
      region: profile.region,
      finance: profile.finance,
      summary: leadSummary(profile),
      meta: { ...profile },
    });
  }

  const leadCaptured = Boolean(profile.phone);
  const reask = validationReask(issues);
  let texts: string[];
  if (reask) {
    texts = [reask];
  } else {
    try {
      const llm = deps?.llm ?? getLlmProvider();
      const raw = await chatWithTimeout(
        llm,
        [
          {
            role: "system",
            content: buildSystemPrompt(input.text, missing),
          },
          ...history.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })),
        ],
        deps?.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
      );
      texts = parseBubbles(raw);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      console.error("[llm]", reason);
      texts = [FALLBACK];
    }
  }

  const text = joinBubbles(texts);
  await appendMessage(sessionId, "assistant", text);
  return out(sessionId, texts, leadCaptured);
}
