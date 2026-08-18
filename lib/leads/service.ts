import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { leads, messages } from "@/lib/db/schema";
import { notifyLead } from "@/lib/leads/notify";

function keep(next: string | null | undefined, prev: string | null | undefined) {
  return next || prev || null;
}

export async function upsertLeadForSession(args: {
  sessionId: string;
  phone?: string | null;
  name?: string | null;
  region?: string | null;
  finance?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<{ id: number; created: boolean } | null> {
  if (!args.phone && !args.name && !args.region && !args.finance) return null;

  const db = getDb();
  const existing = await db
    .select()
    .from(leads)
    .where(eq(leads.sessionId, args.sessionId))
    .limit(1);

  if (existing.length === 0) {
    const result = await db.insert(leads).values({
      sessionId: args.sessionId,
      phone: args.phone ?? null,
      name: args.name ?? null,
      region: args.region ?? null,
      finance: args.finance ?? null,
      summary: args.summary,
      meta: args.meta ?? null,
    });
    const id = Number(result[0].insertId);
    await notifyLead({
      id,
      phone: args.phone ?? null,
      sessionId: args.sessionId,
    });
    return { id, created: true };
  }

  const prev = existing[0];
  const id = prev.id;
  await db
    .update(leads)
    .set({
      phone: keep(args.phone, prev.phone),
      name: keep(args.name, prev.name),
      region: keep(args.region, prev.region),
      finance: keep(args.finance, prev.finance),
      summary: args.summary,
      meta: args.meta ?? prev.meta,
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
