import { and, asc, desc, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { ChannelName } from "@/lib/channels/types";
import { getDb } from "@/lib/db/client";
import { messages, sessions } from "@/lib/db/schema";

export async function createSession(
  channel: ChannelName,
  channelUserId: string,
): Promise<string> {
  const id = randomUUID();
  const db = getDb();
  await db.insert(sessions).values({ id, channel, channelUserId });
  return id;
}

export async function getOrCreateSession(
  sessionId: string | undefined,
  channel: ChannelName,
  channelUserId: string,
): Promise<string> {
  if (!sessionId) return createSession(channel, channelUserId);
  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (rows.length === 0) return createSession(channel, channelUserId);
  return sessionId;
}

export async function getOrCreateSessionByChannelUser(
  channel: ChannelName,
  channelUserId: string,
): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.channel, channel),
        eq(sessions.channelUserId, channelUserId),
      ),
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(1);
  if (rows.length) return rows[0].id;
  return createSession(channel, channelUserId);
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
): Promise<void> {
  const db = getDb();
  await db.insert(messages).values({ sessionId, role, content });
}

export async function loadRecentMessages(
  sessionId: string,
  limit = 12,
): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> {
  const db = getDb();
  const rows = await db
    .select({
      role: messages.role,
      content: messages.content,
      id: messages.id,
    })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.id));
  return rows.slice(-limit).map(({ role, content }) => ({ role, content }));
}

export async function sessionExists(sessionId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return rows.length > 0;
}

export type MessageRow = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
};

/** Newest page first call; pass beforeId for older pages. Chronological order in `messages`. */
export async function loadMessagesPage(
  sessionId: string,
  opts?: { beforeId?: number; limit?: number },
): Promise<{ messages: MessageRow[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const db = getDb();
  const beforeId = opts?.beforeId;

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
    })
    .from(messages)
    .where(
      beforeId != null
        ? and(eq(messages.sessionId, sessionId), lt(messages.id, beforeId))
        : eq(messages.sessionId, sessionId),
    )
    .orderBy(desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
  return { messages: page, hasMore };
}
