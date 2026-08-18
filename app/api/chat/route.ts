import { parseWebChatBody } from "@/lib/channels/web";
import { handleTurn } from "@/lib/conversation/engine";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseWebChatBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const out = await handleTurn(parsed.value);
    return Response.json({
      sessionId: out.sessionId,
      reply: out.text,
      leadCaptured: out.leadCaptured,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status =
      /DATABASE_URL|ECONNREFUSED|mysql/i.test(msg) ? 503 : 500;
    return Response.json({ error: "Chat unavailable" }, { status });
  }
}
