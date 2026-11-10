import { describe, expect, it, vi } from "vitest";
import { applyGuideTurn } from "@/lib/huggies/agent";
import { freshSession } from "@/lib/huggies/machine";
import type { GuideDeps } from "@/lib/huggies/agent";
import type { MachineDeps } from "@/lib/huggies/machine";

function baseDeps(over: Partial<GuideDeps> = {}): GuideDeps {
  const machine: MachineDeps = {
    now: () => 1_700_000_000_000,
    delayMs: 0,
    newJobId: () => "job_1",
    videoUrls: ["https://s3.example/a.mp4"],
    pickVideo: (u) => u[0],
    previewUrl: null,
    learnMoreUrl: "#",
    termsUrl: "#",
  };
  return {
    ...machine,
    guideChat: vi.fn(async () =>
      JSON.stringify({
        reply: "Ok mình ghi nhận nhé!",
        fields: {
          consent: true,
          babyName: "Tủn",
          displayName: "Tủn",
          gender: "boy",
          ageRange: "1-2",
          hobby: "cars",
        },
        readyForPhoto: true,
      }),
    ),
    guideTimeoutMs: 5000,
    ...over,
  };
}

describe("applyGuideTurn", () => {
  it("merges fields and moves to photo when text-complete", async () => {
    const s = freshSession({ id: "g1", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "đồng ý, bé Tủn, giữ tên, trai, 1-2 tuổi, thích xe" },
      baseDeps(),
    );
    expect(out.session.fields.babyName).toBe("Tủn");
    expect(out.session.fields.photoOk).toBe(false);
    expect(out.session.step).toBe("photo");
    expect(out.messages.join(" ")).toMatch(/ảnh|Ok/i);
  });

  it("ends politely on exit", async () => {
    const s = freshSession({ id: "g2", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "không chơi nữa" },
      baseDeps({
        guideChat: vi.fn(async () =>
          JSON.stringify({
            reply: "Cảm ơn ba mẹ, mình dừng tại đây nhé.",
            exit: true,
          }),
        ),
      }),
    );
    expect(out.session.step).toBe("end");
    expect(out.messages.join(" ")).toMatch(/Cảm ơn|dừng/i);
  });

  it("rejects image before text fields are complete", async () => {
    const s = freshSession({ id: "g3", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(s, { type: "image", qc: { ok: true } }, baseDeps());
    expect(out.session.fields.photoOk).toBe(false);
    expect(out.session.step).not.toBe("confirm");
    expect(out.messages.join(" ")).toMatch(/thông tin|trước|ảnh/i);
  });

  it("falls back in VN when LLM times out", async () => {
    const s = freshSession({ id: "g4", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "hello" },
      baseDeps({
        guideTimeoutMs: 10,
        guideChat: () => new Promise((r) => setTimeout(() => r("{}"), 50)),
      }),
    );
    expect(out.messages.join(" ")).not.toMatch(/please|provide/i);
    expect(out.messages.join(" ")).toMatch(/điều khoản|đồng ý|Ba mẹ/i);
  });

  it("starts job on confirm after photoOk", async () => {
    let s = freshSession({ id: "g5", mode: "guide", termsVersion: "t" });
    s.fields = {
      consent: true,
      consentAt: "t",
      termsVersion: "t",
      babyName: "Tủn",
      displayName: "Tủn",
      gender: "boy",
      ageRange: "1-2",
      hobby: "cars",
      photoOk: true,
    };
    s.step = "confirm";
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "oke tạo đi" },
      baseDeps({
        guideChat: vi.fn(async () =>
          JSON.stringify({ reply: "Đang tạo video nhé!", confirm: true }),
        ),
      }),
    );
    expect(out.session.step).toBe("processing");
    expect(out.jobId).toBe("job_1");
  });
});
