import type { IncomingMessage } from "@/lib/channels/types";

type MessengerPayload = {
  sender?: { id?: unknown };
  message?: { text?: unknown };
};

export function normalizeMessengerMessage(
  payload: unknown,
): IncomingMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as MessengerPayload;
  const senderId = p.sender?.id;
  const text = p.message?.text;
  if (typeof senderId !== "string" || !senderId) return null;
  if (typeof text !== "string" || !text) return null;
  return {
    channelUserId: senderId,
    channel: "messenger",
    text,
  };
}
