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
