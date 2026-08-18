import type { IncomingMessage, OutgoingMessage } from "@/lib/channels/types";
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
import { upsertLeadForSession } from "@/lib/leads/service";
import { getLlmProvider, type LlmProvider } from "@/lib/llm";
import type { ChatMessage } from "@/lib/llm/types";

const FALLBACK =
  "Úi vừa đơ một nhịp xíu 🚨 nhắn lại mình nhaaa — MAI vẫn ở đây!";

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
  const profile = extractLeadProfile(userTexts);
  const missing = missingLeadFields(profile);
  const issues = validationIssues(input.text, missing[0] === "region");

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
  let reply: string;
  if (reask) {
    reply = reask;
  } else {
    try {
      const llm = deps?.llm ?? getLlmProvider();
      reply = await chatWithTimeout(
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
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      console.error("[llm]", reason);
      reply = FALLBACK;
    }
  }

  await appendMessage(sessionId, "assistant", reply);
  return { sessionId, text: reply, leadCaptured };
}
