import { describe, expect, it } from "vitest";
import { getOrCreateSession, appendMessage } from "@/lib/conversation/session";
import {
  getLeadWithMessages,
  listLeads,
  upsertLeadForSession,
} from "@/lib/leads/service";
import { notifyLead } from "@/lib/leads/notify";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("leads service", () => {
  it("upserts one lead per session and lists it", async () => {
    const sessionId = await getOrCreateSession(undefined, "web", "lead-user");
    await appendMessage(sessionId, "user", "0901234567");
    const first = await upsertLeadForSession({
      sessionId,
      phone: "0901234567",
      summary: "quan tâm Prestige",
    });
    const second = await upsertLeadForSession({
      sessionId,
      phone: "0912345678",
      summary: "đổi số",
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    const listed = await listLeads();
    expect(listed.some((l) => l.id === first.id && l.phone === "0912345678")).toBe(
      true,
    );

    const detail = await getLeadWithMessages(first.id);
    expect(detail?.messages.length).toBeGreaterThan(0);

    await expect(
      notifyLead({ id: first.id, phone: "0912345678", sessionId }),
    ).resolves.toBeUndefined();
  });
});
