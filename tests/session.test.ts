import { describe, expect, it } from "vitest";
import {
  appendMessage,
  getOrCreateSession,
  getOrCreateSessionByChannelUser,
  loadRecentMessages,
} from "@/lib/conversation/session";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("session persistence", () => {
  it("creates session and round-trips messages", async () => {
    const id = await getOrCreateSession(undefined, "web", "test-user");
    await appendMessage(id, "user", "hello");
    await appendMessage(id, "assistant", "hi there");
    const msgs = await loadRecentMessages(id, 12);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[0].content).toBe("hello");
  });

  it("reuses one messenger session per channelUserId", async () => {
    const first = await getOrCreateSessionByChannelUser("messenger", "mc-user-a");
    await appendMessage(first, "user", "turn1");
    const second = await getOrCreateSessionByChannelUser("messenger", "mc-user-a");
    expect(second).toBe(first);
    const other = await getOrCreateSessionByChannelUser("messenger", "mc-user-b");
    expect(other).not.toBe(first);
  });
});
