import type { IncomingMessage } from "@/lib/channels/types";

const MAX_LEN = 2000;

export function parseWebChatBody(
  body: unknown,
): { ok: true; value: IncomingMessage } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }
  const b = body as Record<string, unknown>;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) return { ok: false, error: "message is required" };
  if (message.length > MAX_LEN) {
    return { ok: false, error: `message exceeds ${MAX_LEN} characters` };
  }
  const sessionId =
    typeof b.sessionId === "string" && b.sessionId.length > 0
      ? b.sessionId
      : undefined;
  const channelUserId =
    typeof b.channelUserId === "string" && b.channelUserId.length > 0
      ? b.channelUserId
      : "anonymous";

  return {
    ok: true,
    value: {
      sessionId,
      channelUserId,
      channel: "web",
      text: message,
    },
  };
}
