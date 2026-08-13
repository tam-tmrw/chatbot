import type { IncomingMessage, OutgoingMessage } from "@/lib/channels/types";
import { extractVnPhone } from "@/lib/conversation/intent";
import { buildSystemPrompt } from "@/lib/conversation/prompt";
import {
  appendMessage,
  getOrCreateSession,
  loadRecentMessages,
} from "@/lib/conversation/session";
import { upsertLeadForSession } from "@/lib/leads/service";
import { getLlmProvider, type LlmProvider } from "@/lib/llm";

const FALLBACK =
  "Úi vừa đơ một nhịp xíu 🚨 nhắn lại mình nhaaa — MAI vẫn ở đây!";

export async function handleTurn(
  input: IncomingMessage,
  deps?: { llm?: LlmProvider },
): Promise<OutgoingMessage> {
  const sessionId = await getOrCreateSession(
    input.sessionId,
    input.channel,
    input.channelUserId,
  );
  await appendMessage(sessionId, "user", input.text);

  const phone = extractVnPhone(input.text);
  let leadCaptured = false;
  if (phone) {
    await upsertLeadForSession({
      sessionId,
      phone,
      summary: `Lead từ hội thoại (${input.channel})`,
    });
    leadCaptured = true;
  }

  const history = await loadRecentMessages(sessionId, 12);
  const llm = deps?.llm ?? getLlmProvider();
  let reply: string;
  try {
    reply = await llm.chat([
      { role: "system", content: buildSystemPrompt(input.text) },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ]);
  } catch {
    reply = FALLBACK;
  }

  await appendMessage(sessionId, "assistant", reply);
  return { sessionId, text: reply, leadCaptured };
}
