import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/conversation/engine", () => ({
  handleTurn: vi.fn(async () => ({
    sessionId: "sess-mc",
    text: "**Yassss** hello",
    texts: ["**Yassss** hello"],
    leadCaptured: false,
  })),
}));

import { POST } from "@/app/api/manychat/callback/route";
import { handleTurn } from "@/lib/conversation/engine";

const prev = { ...process.env };

afterEach(() => {
  process.env = { ...prev };
  vi.mocked(handleTurn).mockClear();
});

function req(body: unknown, secret?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) headers["x-manychat-secret"] = secret;
  return new Request("http://localhost/api/manychat/callback", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/manychat/callback", () => {
  it("returns 503 when secret env missing", async () => {
    delete process.env.MANYCHAT_CALLBACK_SECRET;
    const res = await POST(req({ id: "u", last_input_text: "hi" }, "x"));
    expect(res.status).toBe(503);
  });

  it("returns 401 on bad secret", async () => {
    process.env.MANYCHAT_CALLBACK_SECRET = "good";
    const res = await POST(req({ id: "u", last_input_text: "hi" }, "bad"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 nudge on empty text without calling engine", async () => {
    process.env.MANYCHAT_CALLBACK_SECRET = "good";
    process.env.PUBLIC_BASE_URL = "https://demo.example";
    const res = await POST(req({ id: "u", last_input_text: "  " }, "good"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.version).toBe("v2");
    expect(json.content.messages[0].text).toMatch(/Nhắn chữ/i);
    expect(handleTurn).not.toHaveBeenCalled();
  });

  it("returns Dynamic Block from handleTurn", async () => {
    process.env.MANYCHAT_CALLBACK_SECRET = "good";
    process.env.PUBLIC_BASE_URL = "https://demo.example";
    const res = await POST(
      req({ id: "u1", last_input_text: "hello" }, "good"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content.messages[0].text).toBe("Yassss hello");
    expect(json.content.external_message_callback.url).toBe(
      "https://demo.example/api/manychat/callback",
    );
    expect(handleTurn).toHaveBeenCalledWith({
      channel: "messenger",
      channelUserId: "u1",
      text: "hello",
    });
  });

  it("returns 503 when database unavailable", async () => {
    process.env.MANYCHAT_CALLBACK_SECRET = "good";
    vi.mocked(handleTurn).mockRejectedValueOnce(
      new Error("DATABASE_URL is not set"),
    );
    const res = await POST(req({ id: "u", last_input_text: "hi" }, "good"));
    expect(res.status).toBe(503);
  });
});
