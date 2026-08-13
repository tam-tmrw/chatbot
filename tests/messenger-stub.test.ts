import { describe, expect, it } from "vitest";
import { normalizeMessengerMessage } from "@/lib/channels/messenger";

describe("normalizeMessengerMessage", () => {
  it("maps minimal fake payload", () => {
    const msg = normalizeMessengerMessage({
      sender: { id: "fb_1" },
      message: { text: "hello" },
    });
    expect(msg).toEqual({
      channelUserId: "fb_1",
      channel: "messenger",
      text: "hello",
    });
  });

  it("returns null for garbage", () => {
    expect(normalizeMessengerMessage({})).toBeNull();
  });
});
