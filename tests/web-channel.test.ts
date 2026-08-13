import { describe, expect, it } from "vitest";
import { parseWebChatBody } from "@/lib/channels/web";

describe("parseWebChatBody", () => {
  it("accepts valid payload", () => {
    const r = parseWebChatBody({
      message: "Xin chào",
      sessionId: "sess_1",
      channelUserId: "browser_1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        sessionId: "sess_1",
        channelUserId: "browser_1",
        channel: "web",
        text: "Xin chào",
      });
    }
  });

  it("rejects empty message", () => {
    const r = parseWebChatBody({ message: "   ", channelUserId: "x" });
    expect(r.ok).toBe(false);
  });

  it("defaults channelUserId when missing", () => {
    const r = parseWebChatBody({ message: "hi" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.channelUserId).toBe("anonymous");
  });
});
