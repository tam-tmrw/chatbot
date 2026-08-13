import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { leads, messages } from "@/lib/db/schema";
import { notifyLead } from "@/lib/leads/notify";

export async function upsertLeadForSession(args: {
  sessionId: string;
  phone: string;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<{ id: number; created: boolean }> {
  const db = getDb();
  const existing = await db
    .select()
    .from(leads)
    .where(eq(leads.sessionId, args.sessionId))
    .limit(1);

  if (existing.length === 0) {
    const result = await db.insert(leads).values({
      sessionId: args.sessionId,
      phone: args.phone,
      summary: args.summary,
      meta: args.meta ?? null,
    });
    const id = Number(result[0].insertId);
    await notifyLead({ id, phone: args.phone, sessionId: args.sessionId });
    return { id, created: true };
  }

  const id = existing[0].id;
  await db
    .update(leads)
    .set({
      phone: args.phone,
      summary: args.summary,
      meta: args.meta ?? existing[0].meta,
    })
    .where(eq(leads.id, id));
  return { id, created: false };
}

export async function listLeads() {
  const db = getDb();
  return db.select().from(leads).orderBy(desc(leads.createdAt));
}

export async function getLeadWithMessages(leadId: number) {
  const db = getDb();
  const rows = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!rows.length) return null;
  const lead = rows[0];
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, lead.sessionId))
    .orderBy(messages.id);
  return { lead, messages: msgs };
}
