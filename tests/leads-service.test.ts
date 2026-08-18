import { describe, expect, it } from "vitest";
import { getOrCreateSession, appendMessage } from "@/lib/conversation/session";
import {
  getLeadForSession,
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
      name: "An",
      summary: "Lead Palisade · An",
    });
    const second = await upsertLeadForSession({
      sessionId,
      phone: "0912345678",
      region: "Hà Nội",
      finance: "Trả góp",
      summary: "Lead Palisade · An · Hà Nội · Trả góp · 0912345678",
    });
    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(second?.id).toBe(first?.id);

    const listed = await listLeads();
    expect(
      listed.some(
        (l) =>
          l.id === first!.id &&
          l.phone === "0912345678" &&
          l.name === "An" &&
          l.region === "Hà Nội" &&
          l.finance === "Trả góp",
      ),
    ).toBe(true);

    expect(
      await upsertLeadForSession({ sessionId, summary: "noop" }),
    ).toBeNull();

    const detail = await getLeadWithMessages(first!.id);
    expect(detail?.messages.length).toBeGreaterThan(0);

    await expect(
      notifyLead({ id: first!.id, phone: "0912345678", sessionId }),
    ).resolves.toBeUndefined();

    const bySession = await getLeadForSession(sessionId);
    expect(bySession?.name).toBe("An");
    expect(bySession?.id).toBe(first!.id);
    expect(await getLeadForSession("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
