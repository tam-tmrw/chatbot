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
    termsUrl: "https://terms.example",
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
    expect(out.messages.join("\n")).toContain("https://terms.example");
  });

  it("answers terms questions with URL and stays on consent", async () => {
    const s = freshSession({ id: "g-terms", mode: "guide", termsVersion: "t" });
    const chat = vi.fn(async () => "{}");
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "điều khoản gì vậy" },
      baseDeps({ guideChat: chat, termsUrl: "https://terms.example/tc" }),
    );
    expect(chat).not.toHaveBeenCalled();
    expect(out.session.fields.consent).toBe(false);
    expect(out.session.step).toBe("consent");
    expect(out.messages.join("\n")).toContain("https://terms.example/tc");
    expect(out.messages.join("\n")).toMatch(/đồng ý/i);
  });

  it("after photo uses full confirm summary", async () => {
    let s = freshSession({ id: "g-sum", mode: "guide", termsVersion: "t" });
    s.fields = {
      consent: true,
      consentAt: "t",
      termsVersion: "t",
      babyName: "Tủn",
      displayName: "Tun",
      gender: "boy",
      ageRange: "1-2",
      hobby: "cars",
      photoOk: false,
    };
    s.step = "photo";
    const out = await applyGuideTurn(
      s,
      { type: "image", qc: { ok: true } },
      baseDeps(),
    );
    expect(out.session.step).toBe("confirm");
    const msg = out.messages.join("\n");
    expect(msg).toMatch(/Tủn/);
    expect(msg).toMatch(/Tun/);
    expect(msg).toMatch(/Xe hơi/);
    expect(msg).toMatch(/xác nhận|tạo video/i);
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

  it("does not set consent on negation", async () => {
    const s = freshSession({ id: "g6", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "không đồng ý" },
      baseDeps({ guideChat: vi.fn(async () => JSON.stringify({ reply: "Dạ vâng ạ.", fields: { consent: true } })) }),
    );
    expect(out.session.fields.consent).toBe(false);
    const out2 = await applyGuideTurn(
      s,
      { type: "text", text: "chưa đồng ý" },
      baseDeps(),
    );
    expect(out2.session.fields.consent).toBe(false);
  });

  it("ignores LLM-only consent on an unrelated message", async () => {
    const s = freshSession({ id: "g7", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(s, { type: "text", text: "bé tên Bin" }, baseDeps());
    expect(out.session.fields.consent).toBe(false);
    expect(out.session.step).toBe("consent");
  });

  it("sets consent on explicit agreement text", async () => {
    const s = freshSession({ id: "g8", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(s, { type: "text", text: "đồng ý" }, baseDeps());
    expect(out.session.fields.consent).toBe(true);
  });

  it("stays ended after step=end (no checklist revival, no LLM call)", async () => {
    const s = freshSession({ id: "g9", mode: "guide", termsVersion: "t" });
    s.step = "end";
    const guideChat = vi.fn(async () => "{}");
    const out = await applyGuideTurn(s, { type: "text", text: "đồng ý" }, baseDeps({ guideChat }));
    expect(out.session.step).toBe("end");
    expect(guideChat).not.toHaveBeenCalled();
    expect(out.messages.join(" ")).toMatch(/Cảm ơn/);
  });

  it("delegates result-step replay and learn to the machine", async () => {
    const s = freshSession({ id: "g10", mode: "guide", termsVersion: "t" });
    s.step = "result";
    const replay = await applyGuideTurn(s, { type: "button", buttonId: "replay" }, baseDeps());
    expect(replay.restart).toBe(true);
    const learn = await applyGuideTurn(s, { type: "button", buttonId: "learn" }, baseDeps());
    expect(learn.messages).toEqual(["#"]);
  });

  it("does not end when the LLM reply merely contains an exit word", async () => {
    const s = freshSession({ id: "g11", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "bé tên Bin" },
      baseDeps({
        guideChat: vi.fn(async () =>
          JSON.stringify({ reply: "Để kết thúc, ba mẹ cho mình tên bé nhé?", fields: {} }),
        ),
      }),
    );
    expect(out.session.step).not.toBe("end");
  });

  it("exit words in user text need word boundaries", async () => {
    const s = freshSession({ id: "g12", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "bé tên Bybyebye" },
      baseDeps({ guideChat: vi.fn(async () => JSON.stringify({ reply: "Ok ạ?" })) }),
    );
    expect(out.session.step).not.toBe("end");
  });
});
