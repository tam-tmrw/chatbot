import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/conversation/engine", () => ({
  handleTurn: vi.fn(async () => ({
    sessionId: "abc",
    text: "hello",
    leadCaptured: false,
  })),
}));

import { POST } from "@/app/api/chat/route";
import { handleTurn } from "@/lib/conversation/engine";

describe("POST /api/chat", () => {
  it("returns 400 for empty message", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 503 when database unavailable", async () => {
    vi.mocked(handleTurn).mockRejectedValueOnce(
      new Error("DATABASE_URL is not set"),
    );
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", channelUserId: "u1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toEqual({ error: "Chat unavailable" });
  });

  it("returns reply payload", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", channelUserId: "u1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      sessionId: "abc",
      reply: "hello",
      leadCaptured: false,
    });
  });
});
