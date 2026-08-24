import { describe, expect, it } from "vitest";
import {
  appendMessage,
  getOrCreateSession,
  getOrCreateSessionByChannelUser,
  loadMessagesPage,
  loadRecentMessages,
  sessionExists,
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
    const first = await getOrCreateSessionByChannelUser(
      "messenger",
      "mc-user-a",
    );
    await appendMessage(first, "user", "turn1");
    const second = await getOrCreateSessionByChannelUser(
      "messenger",
      "mc-user-a",
    );
    expect(second).toBe(first);
    const other = await getOrCreateSessionByChannelUser(
      "messenger",
      "mc-user-b",
    );
    expect(other).not.toBe(first);
  });

  it("paginates with beforeId", async () => {
    const id = await getOrCreateSession(undefined, "web", "page-user");
    for (let i = 0; i < 5; i++) {
      await appendMessage(id, "user", `u${i}`);
    }
    const first = await loadMessagesPage(id, { limit: 2 });
    expect(first.messages).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.messages.map((m) => m.content)).toEqual(["u3", "u4"]);

    const older = await loadMessagesPage(id, {
      limit: 2,
      beforeId: first.messages[0].id,
    });
    expect(older.messages.map((m) => m.content)).toEqual(["u1", "u2"]);
    expect(older.hasMore).toBe(true);

    const oldest = await loadMessagesPage(id, {
      limit: 2,
      beforeId: older.messages[0].id,
    });
    expect(oldest.messages.map((m) => m.content)).toEqual(["u0"]);
    expect(oldest.hasMore).toBe(false);
  });

  it("sessionExists", async () => {
    const id = await getOrCreateSession(undefined, "web", "exists-user");
    expect(await sessionExists(id)).toBe(true);
    expect(await sessionExists("00000000-0000-0000-0000-000000000000")).toBe(
      false,
    );
  });
});
