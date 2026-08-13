import { afterEach, describe, expect, it } from "vitest";
import { getLlmProvider } from "@/lib/llm";

describe("getLlmProvider", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("throws when openai selected without key", () => {
    process.env.LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    expect(() => getLlmProvider()).toThrow(/OPENAI_API_KEY/);
  });
});
