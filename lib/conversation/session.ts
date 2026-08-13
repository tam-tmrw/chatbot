import { asc, eq } from "drizzle-orm";
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

export async function getSessionStage(
  sessionId: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ stage: sessions.stage })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return rows[0]?.stage ?? null;
}

export async function updateSessionStage(
  sessionId: string,
  stage: string | null,
): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ stage }).where(eq(sessions.id, sessionId));
}
