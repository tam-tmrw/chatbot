import { normalizeMessengerMessage } from "@/lib/channels/messenger";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.MESSENGER_VERIFY_TOKEN;

  if (
    mode === "subscribe" &&
    token &&
    challenge &&
    verifyToken &&
    token === verifyToken
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  normalizeMessengerMessage(body);

  return Response.json(
    { error: "Messenger send not implemented in v1" },
    { status: 501 },
  );
}
