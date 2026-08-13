import type { IncomingMessage, OutgoingMessage } from "@/lib/channels/types";
import {
  detectNeedGroup,
  nextStage,
  parseFlowStage,
  quickRepliesFor,
} from "@/lib/conversation/flow";
import {
  extractLeadProfile,
  isProfileComplete,
  leadSummary,
  missingLeadFields,
  validationIssues,
  validationReask,
} from "@/lib/conversation/profile";
import { buildSystemPrompt } from "@/lib/conversation/prompt";
import {
  appendMessage,
  getOrCreateSession,
  getSessionStage,
  loadRecentMessages,
  updateSessionStage,
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

  const history = await loadRecentMessages(sessionId, 12);
  const userTexts = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const profile = extractLeadProfile(userTexts);
  const needGroup = detectNeedGroup(input.text);
  const missing = missingLeadFields(profile);
  const issues = validationIssues(input.text, missing[0] === "region");
  const askFields = issues[0]
    ? [issues[0], ...missing.filter((f) => f !== issues[0])]
    : missing;

  if (profile.phone || profile.name || profile.region || profile.finance) {
    await upsertLeadForSession({
      sessionId,
      phone: profile.phone,
      name: profile.name,
      region: profile.region,
      finance: profile.finance,
      summary: leadSummary(profile),
      meta: { needGroup, ...profile },
    });
  }

  const leadCaptured = Boolean(profile.phone);
  const prevStage = parseFlowStage(await getSessionStage(sessionId));
  let stage = nextStage({
    prevStage,
    userText: input.text,
    profileComplete: isProfileComplete(profile),
    hasPhone: Boolean(profile.phone),
  });
  if (issues.length) stage = "capture_phone";
  await updateSessionStage(sessionId, stage);

  const reask = validationReask(issues);
  let reply: string;
  if (reask) {
    reply = reask;
  } else {
    const llm = deps?.llm ?? getLlmProvider();
    try {
      reply = await llm.chat([
        {
          role: "system",
          content: buildSystemPrompt(input.text, stage, missing),
        },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
      ]);
    } catch {
      reply = FALLBACK;
    }
  }

  await appendMessage(sessionId, "assistant", reply);
  return {
    sessionId,
    text: reply,
    leadCaptured,
    quickReplies: quickRepliesFor(stage, needGroup, askFields),
    stage,
  };
}
