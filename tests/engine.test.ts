import { describe, expect, it } from "vitest";
import { handleTurn } from "@/lib/conversation/engine";
import type { LlmProvider } from "@/lib/llm/types";

const hasDb = Boolean(process.env.DATABASE_URL);

const mockLlm: LlmProvider = {
  async chat() {
    return "Ok chị ơi, em ghi nhận nha!";
  },
};

describe.skipIf(!hasDb)("handleTurn", () => {
  it("returns sessionId and reply", async () => {
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user",
        text: "Palisade có gì hay?",
      },
      { llm: mockLlm },
    );
    expect(out.sessionId).toBeTruthy();
    expect(out.text).toContain("Ok chị");
    expect(out.leadCaptured).toBe(false);
    expect(out.quickReplies.length).toBeGreaterThan(0);
    expect(out.stage).toBeTruthy();
  });

  it("captures lead when user sends phone", async () => {
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-2",
        text: "Số mình 0901234567",
      },
      { llm: mockLlm },
    );
    expect(out.leadCaptured).toBe(true);
  });

  it("does not save invalid phone and re-asks", async () => {
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-bad-phone",
        text: "Số mình 0123456789",
      },
      { llm: mockLlm },
    );
    expect(out.leadCaptured).toBe(false);
    expect(out.text).toMatch(/định dạng/i);
    expect(out.stage).toBe("capture_phone");
    expect(out.quickReplies).toContain("Để lại SĐT sau");
  });

  it("does not save unknown region and re-asks", async () => {
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-bad-region",
        text: "Mình ở xyzland",
      },
      { llm: mockLlm },
    );
    expect(out.leadCaptured).toBe(false);
    expect(out.text).toMatch(/chưa nhận ra/i);
    expect(out.quickReplies).toContain("Hà Nội");
  });

  it("saves name/region/finance incrementally before phone", async () => {
    const { listLeads } = await import("@/lib/leads/service");
    const first = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-profile",
        text: "Tên mình là An",
      },
      { llm: mockLlm },
    );
    expect(first.leadCaptured).toBe(false);
    await handleTurn(
      {
        sessionId: first.sessionId,
        channel: "web",
        channelUserId: "engine-user-profile",
        text: "Mình ở Hà Nội",
      },
      { llm: mockLlm },
    );
    await handleTurn(
      {
        sessionId: first.sessionId,
        channel: "web",
        channelUserId: "engine-user-profile",
        text: "Trả góp",
      },
      { llm: mockLlm },
    );
    const listed = await listLeads();
    const row = listed.find((l) => l.sessionId === first.sessionId);
    expect(row?.name).toBe("An");
    expect(row?.region).toBe("Hà Nội");
    expect(row?.finance).toBe("Trả góp");
    expect(row?.phone).toBeNull();
  });

  it("returns Vietnamese fallback when LLM throws", async () => {
    const failingLlm: LlmProvider = {
      async chat() {
        throw new Error("LLM unavailable");
      },
    };
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-fallback",
        text: "Palisade có gì hay?",
      },
      { llm: failingLlm },
    );
    expect(out.text).toContain("đơ một nhịp");
    expect(out.leadCaptured).toBe(false);
  });

  it("still captures lead when LLM throws but phone present", async () => {
    const failingLlm: LlmProvider = {
      async chat() {
        throw new Error("LLM unavailable");
      },
    };
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-fallback-phone",
        text: "Số mình 0901234567",
      },
      { llm: failingLlm },
    );
    expect(out.text).toContain("đơ một nhịp");
    expect(out.leadCaptured).toBe(true);
  });
});
