import { describe, expect, it } from "vitest";
import { extractFields, sanitizeReply } from "@/lib/huggies/ai";
import type { LlmProvider } from "@/lib/llm";

function llm(reply: string | Promise<string>): LlmProvider {
  return { chat: () => Promise.resolve(reply) };
}

describe("extractFields", () => {
  it("parses a fenced JSON object and drops an unknown hobby", async () => {
    const out = await extractFields(
      llm('```json\n{"babyName":"Bin","gender":"boy","hobby":"rocket","reply":"ok"}\n```'),
      "baby_name",
      "bé tên Bin",
    );
    expect(out.babyName).toBe("Bin");
    expect(out.gender).toBe("boy");
    expect(out.hobby).toBeUndefined();
  });

  it("throws when the model exceeds the timeout", async () => {
    const slow: LlmProvider = {
      chat: () => new Promise((resolve) => setTimeout(() => resolve("{}"), 50)),
    };
    await expect(extractFields(slow, "baby_name", "Bin", 10)).rejects.toThrow(
      /timeout/i,
    );
  });

  it("throws on prose", async () => {
    await expect(
      extractFields(llm("xin lỗi mình không hiểu"), "baby_name", "???"),
    ).rejects.toThrow();
  });

  it("drops English reply crumbs from the model", async () => {
    expect(sanitizeReply("Please provide the baby name.")).toBeNull();
    expect(sanitizeReply("Ba mẹ gõ tên bé giúp mình nhé — ví dụ Bin.")).toMatch(/Bin/);
    const out = await extractFields(
      llm('{"babyName":null,"reply":"Please provide the baby\'s name."}'),
      "baby_name",
      "sao vậy",
    );
    expect(out.reply).toBeUndefined();
    expect(out.babyName).toBeUndefined();
  });
});
