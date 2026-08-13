import { describe, expect, it } from "vitest";
import { extractVnPhone, normalizeVnPhone } from "@/lib/conversation/intent";

describe("normalizeVnPhone", () => {
  it("normalizes +84 to leading 0", () => {
    expect(normalizeVnPhone("+84901234567")).toBe("0901234567");
  });

  it("strips spaces and dots", () => {
    expect(normalizeVnPhone("0901 234 567")).toBe("0901234567");
  });

  it("rejects too-short numbers", () => {
    expect(normalizeVnPhone("090123")).toBeNull();
  });
});

describe("extractVnPhone", () => {
  it("finds phone inside a sentence", () => {
    expect(extractVnPhone("Chị liên hệ mình số 0901 234 567 nhé")).toBe(
      "0901234567",
    );
  });

  it("returns null when no phone", () => {
    expect(extractVnPhone("Xe này bao nhiêu vậy?")).toBeNull();
  });
});
