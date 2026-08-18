import type { IncomingMessage } from "@/lib/channels/types";
import { stripMarkdownForMessenger } from "@/lib/chat/markdown";

const MAX_LEN = 2000;

export type ManyChatParseFail = "missing_user" | "empty_text";

export type ManyChatDynamicBlock = {
  version: "v2";
  content: {
    messages: Array<{ type: "text"; text: string }>;
    actions: [];
    quick_replies: [];
    external_message_callback?: {
      url: string;
      method: "post";
      headers: Record<string, string>;
      payload: { id: string; last_input_text: string };
      timeout: number;
    };
  };
};

function readUserId(b: Record<string, unknown>): string {
  for (const key of ["id", "user_id", "subscriber_id"]) {
    const v = b[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function readText(b: Record<string, unknown>): string {
  for (const key of ["last_input_text", "last_input", "text", "message"]) {
    const v = b[key];
    if (typeof v === "string") return v.trim();
  }
  return "";
}

export function parseManyChatBody(
  body: unknown,
): { ok: true; value: IncomingMessage } | { ok: false; reason: ManyChatParseFail } {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "missing_user" };
  }
  const b = body as Record<string, unknown>;
  const channelUserId = readUserId(b);
  if (!channelUserId) return { ok: false, reason: "missing_user" };
  const raw = readText(b);
  if (!raw) return { ok: false, reason: "empty_text" };
  return {
    ok: true,
    value: {
      channel: "messenger",
      channelUserId,
      text: raw.slice(0, MAX_LEN),
    },
  };
}

export function toDynamicBlock(text: string): ManyChatDynamicBlock {
  const stripped = stripMarkdownForMessenger(text).slice(0, MAX_LEN);
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  const secret = process.env.MANYCHAT_CALLBACK_SECRET;
  const content: ManyChatDynamicBlock["content"] = {
    messages: [{ type: "text", text: stripped || " " }],
    actions: [],
    quick_replies: [],
  };
  if (base && secret) {
    content.external_message_callback = {
      url: `${base}/api/manychat/callback`,
      method: "post",
      headers: { "x-manychat-secret": secret },
      payload: {
        id: "{{user_id}}",
        last_input_text: "{{last_input_text}}",
      },
      timeout: 86400,
    };
  }
  return { version: "v2", content };
}
