import { describe, expect, it } from "vitest";
import {
  extractVnPhone,
  looksLikeInvalidPhone,
  normalizeVnPhone,
} from "@/lib/conversation/intent";

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

describe("looksLikeInvalidPhone", () => {
  it("flags short or illegal prefixes, not valid VN mobiles", () => {
    expect(looksLikeInvalidPhone("Số mình 090123")).toBe(true);
    expect(looksLikeInvalidPhone("0123456789")).toBe(true);
    expect(looksLikeInvalidPhone("0901234567")).toBe(false);
    expect(looksLikeInvalidPhone("Palisade có gì hay?")).toBe(false);
  });

  it("does not hijack price/date messages with scattered digits", () => {
    expect(
      looksLikeInvalidPhone(
        "Prestige 1.559 tỷ so với Exclusive 2.099 tỷ chênh nhiều không?",
      ),
    ).toBe(false);
    expect(
      looksLikeInvalidPhone("Mình xem ngày 18/08/2026 lái thử được không?"),
    ).toBe(false);
    expect(looksLikeInvalidPhone("0123456789")).toBe(true);
    expect(looksLikeInvalidPhone("Số mình 090123")).toBe(true);
    expect(looksLikeInvalidPhone("0901234567")).toBe(false);
  });
});
