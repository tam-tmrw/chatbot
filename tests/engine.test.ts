import { describe, expect, it } from "vitest";
import { handleTurn } from "@/lib/conversation/engine";
import type { LlmProvider } from "@/lib/llm/types";

const hasDb = Boolean(process.env.DATABASE_URL);

const mockLlm: LlmProvider = {
  async chat() {
    return "Ok chị ơi, em ghi nhận nha!";
  },
};

const mockJsonLlm: LlmProvider = {
  async chat() {
    return JSON.stringify({
      bubbles: ["Đoạn một nha.", "Đoạn hai — bạn nghĩ sao?"],
    });
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
    expect(out.texts).toEqual([out.text]);
    expect(out.leadCaptured).toBe(false);
  });

  it("parses LLM JSON into multiple texts", async () => {
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-bubbles",
        text: "Palisade có gì hay?",
      },
      { llm: mockJsonLlm },
    );
    expect(out.texts).toEqual([
      "Đoạn một nha.",
      "Đoạn hai — bạn nghĩ sao?",
    ]);
    expect(out.text).toContain("Đoạn một");
    expect(out.text).toContain("Đoạn hai");

    const { loadRecentMessages } = await import("@/lib/conversation/session");
    const msgs = await loadRecentMessages(out.sessionId, 24);
    const assistant = msgs.filter((m) => m.role === "assistant");
    expect(assistant.map((m) => m.content)).toEqual([
      "Đoạn một nha.",
      "Đoạn hai — bạn nghĩ sao?",
    ]);
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
    expect(out.text).toContain("chậm một nhịp");
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
    expect(out.text).toContain("chậm một nhịp");
    expect(out.leadCaptured).toBe(true);
  });

  it("reuses messenger session across turns", async () => {
    const first = await handleTurn(
      {
        channel: "messenger",
        channelUserId: "engine-mc-same",
        text: "hello",
      },
      { llm: mockLlm },
    );
    const second = await handleTurn(
      {
        channel: "messenger",
        channelUserId: "engine-mc-same",
        text: "ủa sao vậy",
      },
      { llm: mockLlm },
    );
    expect(second.sessionId).toBe(first.sessionId);
  });

  it("saves name/region/finance before phone", async () => {
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
    const row = (await listLeads()).find((l) => l.sessionId === first.sessionId);
    expect(row?.name).toBe("An");
    expect(row?.region).toBe("Hà Nội");
    expect(row?.finance).toBe("Trả góp");
    expect(row?.phone).toBeNull();
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
  });

  it("falls back when LLM exceeds timeout", async () => {
    const slow: LlmProvider = {
      async chat() {
        await new Promise((r) => setTimeout(r, 200));
        return "should not appear";
      },
    };
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-timeout",
        text: "hello",
      },
      { llm: slow, llmTimeoutMs: 20 },
    );
    expect(out.text).toContain("chậm một nhịp");
    expect(out.text).not.toContain("should not appear");
  });
});
