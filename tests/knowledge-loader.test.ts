import { describe, expect, it } from "vitest";
import { loadKnowledgeContext } from "@/lib/knowledge/loader";

describe("loadKnowledgeContext", () => {
  it("always includes Exclusive price", () => {
    const ctx = loadKnowledgeContext("xin chào");
    expect(ctx).toContain("Exclusive");
    expect(ctx).toContain("1.469");
  });

  it("includes ADAS when asked", () => {
    const ctx = loadKnowledgeContext("xe có ga tự động thích ứng không?");
    expect(ctx.toLowerCase()).toMatch(/adas|ga tự động|điểm mù/);
  });
});
