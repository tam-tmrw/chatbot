import { parseManyChatBody, toDynamicBlock } from "@/lib/channels/manychat";
import { handleTurn } from "@/lib/conversation/engine";

const NUDGE_USER =
  "Mình chưa nhận ra bạn — nhắn lại giúp mình một câu nhé.";
const NUDGE_TEXT =
  "Nhắn chữ giúp mình nhé — ảnh/sticker mình chưa đọc được.";
const NUDGE_JSON =
  "Mình chưa nhận ra tin này — nhắn lại giúp mình một câu nhé.";
const FALLBACK =
  "Mạng hơi chậm một nhịp. Bạn nhắn lại giúp mình nhé — mình vẫn ở đây.";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function unavailable() {
  return Response.json({ error: "Chat unavailable" }, { status: 503 });
}

export async function POST(req: Request) {
  const secret = process.env.MANYCHAT_CALLBACK_SECRET;
  if (!secret) return unavailable();
  if (req.headers.get("x-manychat-secret") !== secret) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(toDynamicBlock(NUDGE_JSON));
  }

  const parsed = parseManyChatBody(body);
  if (!parsed.ok) {
    const text = parsed.reason === "empty_text" ? NUDGE_TEXT : NUDGE_USER;
    return Response.json(toDynamicBlock(text));
  }

  try {
    const out = await handleTurn(parsed.value);
    return Response.json(toDynamicBlock(out.texts));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    if (/DATABASE_URL|ECONNREFUSED|mysql/i.test(msg)) return unavailable();
    return Response.json(toDynamicBlock(FALLBACK));
  }
}
