import { describe, expect, it } from "vitest";
import {
  extractFinance,
  extractLeadProfile,
  extractName,
  extractRegion,
  isProfileComplete,
  looksLikeInvalidRegion,
  missingLeadFields,
  validationReask,
} from "@/lib/conversation/profile";

describe("extractName", () => {
  it("reads Vietnamese name introductions", () => {
    expect(extractName("Tên mình là Nguyễn An")).toBe("Nguyễn An");
    expect(extractName("Mình là Minh")).toBe("Minh");
  });
  it("ignores non-names", () => {
    expect(extractName("Mình là người thích xe")).toBeNull();
  });
});

describe("extractRegion + extractFinance", () => {
  it("reads city and finance", () => {
    expect(extractRegion("Mình ở Hà Nội")).toBe("Hà Nội");
    expect(extractRegion("Sống tại Đà Lạt")).toBe("Đà Lạt");
    expect(extractRegion("Hà Nội")).toBe("Hà Nội");
    expect(extractFinance("Mình tính trả góp")).toBe("Trả góp");
    expect(extractFinance("Tiền mặt tầm 1.5 tỷ")).toBe("Tiền mặt (~1.5 tỷ)");
  });

  it("ignores need-group chips that are not personal profile", () => {
    expect(extractFinance("Trả góp / tài chính")).toBeNull();
    expect(extractRegion("Hay đi tỉnh / Đà Lạt")).toBeNull();
  });

  it("rejects unknown địa chỉ", () => {
    expect(extractRegion("Mình ở xyzland")).toBeNull();
    expect(looksLikeInvalidRegion("Mình ở xyzland", false)).toBe(true);
    expect(looksLikeInvalidRegion("Bình Dương", true)).toBe(false);
    expect(extractRegion("Bình Dương")).toBe("Bình Dương");
    expect(validationReask(["phone"])).toMatch(/định dạng/i);
    expect(validationReask(["region"])).toMatch(/chưa nhận ra/i);
  });

  it("requires a location cue for invalid-region", () => {
    expect(looksLikeInvalidRegion("Xe này đẹp quá", true)).toBe(false);
    expect(looksLikeInvalidRegion("Mình ở xyzland", false)).toBe(true);
  });
});

describe("extractLeadProfile", () => {
  it("merges fields across user turns", () => {
    const p = extractLeadProfile([
      "Tên mình là An",
      "Ở TP.HCM",
      "Trả góp",
      "SĐT 0901234567",
    ]);
    expect(p).toEqual({
      name: "An",
      region: "TP. Hồ Chí Minh",
      finance: "Trả góp",
      phone: "0901234567",
    });
    expect(isProfileComplete(p)).toBe(true);
    expect(missingLeadFields({ ...p, phone: null })).toEqual(["phone"]);
  });
});
