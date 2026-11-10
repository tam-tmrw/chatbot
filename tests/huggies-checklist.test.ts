import { describe, expect, it } from "vitest";
import {
  confirmSummary,
  consentPrompt,
  firstMissingHint,
  guideReprompt,
  looksLikeConfused,
  looksLikeTermsAsk,
  missingTextKeys,
  textFieldsComplete,
} from "@/lib/huggies/checklist";
import { HOBBIES } from "@/lib/huggies/validate";
import type { Fields } from "@/lib/huggies/types";

const empty = (): Fields => ({
  consent: false,
  consentAt: null,
  termsVersion: "t",
  babyName: null,
  displayName: null,
  gender: null,
  ageRange: null,
  hobby: null,
  photoOk: false,
});

describe("huggies checklist", () => {
  it("lists missing text keys in order and builds a VN hint", () => {
    const f = empty();
    expect(missingTextKeys(f)[0]).toBe("consent");
    expect(textFieldsComplete(f)).toBe(false);
    expect(firstMissingHint(f, { termsUrl: "https://terms.example" })).toContain(
      "https://terms.example",
    );
    expect(firstMissingHint(f, { termsUrl: "https://terms.example" })).toMatch(/đồng ý/i);
    f.consent = true;
    f.babyName = "Tủn";
    expect(missingTextKeys(f)[0]).toBe("displayName");
    f.displayName = "Tủn";
    f.gender = "boy";
    f.ageRange = "1-2";
    f.hobby = "cars";
    expect(textFieldsComplete(f)).toBe(true);
    expect(missingTextKeys(f)).toEqual([]);
  });

  it("consentPrompt always includes purpose, url, and CTA", () => {
    const p = consentPrompt("https://terms.example/tc");
    expect(p).toMatch(/ảnh|video/i);
    expect(p).toContain("Điều khoản: https://terms.example/tc");
    expect(p).toMatch(/đồng ý/i);
  });

  it("detects terms questions without treating đồng ý as ask", () => {
    expect(looksLikeTermsAsk("điều khoản gì vậy")).toBe(true);
    expect(looksLikeTermsAsk("cho xem link điều khoản")).toBe(true);
    expect(looksLikeTermsAsk("đồng ý")).toBe(false);
    expect(looksLikeTermsAsk("ok")).toBe(false);
  });

  it("detects confused / off-script clarification", () => {
    expect(looksLikeConfused("cái này là gì vậy")).toBe(true);
    expect(looksLikeConfused("chưa hiểu")).toBe(true);
    expect(looksLikeConfused("đồng ý")).toBe(false);
    expect(looksLikeConfused("ok")).toBe(false);
  });

  it("guideReprompt re-explains without chưa nghe rõ", () => {
    const msg = guideReprompt(empty(), "https://terms.example/tc");
    expect(msg).toMatch(/nhắc lại|giải thích lại/i);
    expect(msg).not.toMatch(/chưa nghe rõ/i);
    expect(msg).toContain("https://terms.example/tc");
  });

  it("babyName hint is warm and mentions Huggies", () => {
    const f = empty();
    f.consent = true;
    expect(firstMissingHint(f)).toMatch(/Huggies hỏi|tên/i);
    expect(firstMissingHint(f)).toMatch(/👶/);
    expect(firstMissingHint(f)).not.toMatch(/trả lời tự nhiên/i);
  });

  it("hobby hint lists icons per hobby", () => {
    const f = empty();
    Object.assign(f, {
      consent: true,
      babyName: "Tủn",
      displayName: "Tun",
      gender: "boy",
      ageRange: "1-2",
    });
    const hint = firstMissingHint(f);
    expect(hint).toMatch(/🐾/);
    expect(hint).toMatch(/Động vật/);
    expect(hint).toMatch(/👑/);
  });

  it("hobby hint lists every HOBBIES label", () => {
    const f = empty();
    f.consent = true;
    f.babyName = "Tủn";
    f.displayName = "Tun";
    f.gender = "boy";
    f.ageRange = "1-2";
    const hint = firstMissingHint(f);
    for (const h of HOBBIES) {
      expect(hint).toContain(h.label);
    }
    expect(hint).not.toMatch(/…|\.\.\./);
  });

  it("confirmSummary lists all collected fields", () => {
    const f = empty();
    f.consent = true;
    f.babyName = "Tủn";
    f.displayName = "Tun";
    f.gender = "boy";
    f.ageRange = "1-2";
    f.hobby = "cars";
    f.photoOk = true;
    const s = confirmSummary(f);
    expect(s).toMatch(/Tủn/);
    expect(s).toMatch(/Tun/);
    expect(s).toMatch(/trai|Bé trai/i);
    expect(s).toMatch(/1–2|1-2/);
    expect(s).toMatch(/Xe hơi/);
    expect(s).toMatch(/Ảnh|ảnh/);
    expect(s).toMatch(/xác nhận|tạo video/i);
  });

  it("firstMissingHint asks for photo (not confirm) when text done and !photoOk", () => {
    const f = empty();
    Object.assign(f, { consent: true, babyName: "Tủn", displayName: "Tun", gender: "boy", ageRange: "1-2", hobby: "cars" });
    expect(firstMissingHint(f)).toMatch(/ảnh/);
    expect(firstMissingHint(f)).not.toMatch(/xác nhận/);
    f.photoOk = true;
    expect(firstMissingHint(f)).toMatch(/xác nhận/);
  });
});
