import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("huggies page contract", () => {
  it("gates on the huggies cookie and posts to the huggies API", () => {
    const page = readFileSync("app/huggies/page.tsx", "utf8");
    const chat = readFileSync("app/huggies/HuggiesChat.tsx", "utf8");
    expect(page).toContain('demo="huggies"');
    expect(page).toContain('cookieName("huggies")');
    expect(chat).toContain("/api/huggies/session");
    expect(chat).toContain("/api/huggies/message");
    expect(chat).toContain("/api/huggies/job");
    expect(chat).toContain('"mode"');
    expect(chat).toContain("guide");
  });

  it("locks composer photo until photo step", () => {
    const chat = readFileSync("app/huggies/HuggiesChat.tsx", "utf8");
    expect(chat).toContain("guidePhotoLocked");
    expect(chat).toMatch(/guidePhotoLocked = step !== "photo"/);
    expect(chat).toMatch(/disabled=\{busy \|\| guidePhotoLocked\}/);
  });

  it("guide uses camera click; dropzone is messenger-only; video has clickable link", () => {
    const chat = readFileSync("app/huggies/HuggiesChat.tsx", "utf8");
    expect(chat).toMatch(/showDropzone = step === "photo" && channel === "messenger"/);
    expect(chat).toContain("Xem / mở video");
    expect(chat).toContain("target=\"_blank\"");
  });
});
