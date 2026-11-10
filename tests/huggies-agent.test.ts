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

  it("falls back by re-explaining current step when LLM times out", async () => {
    const s = freshSession({ id: "g4", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "hello" },
      baseDeps({
        guideTimeoutMs: 10,
        guideChat: () => new Promise((r) => setTimeout(() => r("{}"), 50)),
      }),
    );
    expect(out.messages.join(" ")).not.toMatch(/please|provide|chưa nghe rõ/i);
    expect(out.messages.join(" ")).toMatch(/giải thích lại|điều khoản|đồng ý/i);
    expect(out.messages.join("\n")).toContain("https://terms.example");
  });

  it("re-explains current step on confused questions without LLM", async () => {
    const s = freshSession({ id: "g-confused", mode: "guide", termsVersion: "t" });
    const chat = vi.fn(async () => "{}");
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "cái này là gì vậy" },
      baseDeps({ guideChat: chat, termsUrl: "https://terms.example/tc" }),
    );
    expect(chat).not.toHaveBeenCalled();
    expect(out.session.fields.consent).toBe(false);
    expect(out.session.step).toBe("consent");
    const msg = out.messages.join("\n");
    expect(msg).not.toMatch(/chưa nghe rõ/i);
    expect(msg).toMatch(/giải thích lại/i);
    expect(msg).toContain("https://terms.example/tc");

    const out2 = await applyGuideTurn(
      out.session,
      { type: "text", text: "chưa hiểu" },
      baseDeps({ guideChat: chat, termsUrl: "https://terms.example/tc" }),
    );
    expect(chat).not.toHaveBeenCalled();
    expect(out2.messages.join("\n")).not.toMatch(/chưa nghe rõ/i);
    expect(out2.messages.join("\n")).toContain("https://terms.example/tc");
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

  it("while !consent, any non-agree message shows terms without LLM", async () => {
    const s = freshSession({ id: "g10", mode: "guide", termsVersion: "t" });
    const guideChat = vi.fn(async () => JSON.stringify({ reply: "Ba mẹ đồng ý điều khoản nhé?" }));
    const out = await applyGuideTurn(s, { type: "text", text: "hello" }, baseDeps({ guideChat }));
    expect(guideChat).not.toHaveBeenCalled();
    expect(out.session.fields.consent).toBe(false);
    expect(out.session.step).toBe("consent");
    expect(out.messages.join("\n")).toContain("https://terms.example");
  });

  it("bare 'ok' on welcome shows terms; second 'ok' consents without LLM", async () => {
    const s = freshSession({ id: "g11", mode: "guide", termsVersion: "t" });
    const guideChat = vi.fn(async () => JSON.stringify({ reply: "Dạ vâng ạ." }));
    const out = await applyGuideTurn(s, { type: "text", text: "ok" }, baseDeps({ guideChat }));
    expect(guideChat).not.toHaveBeenCalled();
    expect(out.session.fields.consent).toBe(false);
    expect(out.messages.join("\n")).toContain("https://terms.example");
    expect(out.session.step).toBe("consent");
    const out2 = await applyGuideTurn(out.session, { type: "text", text: "ok đi nào" }, baseDeps({ guideChat }));
    expect(guideChat).not.toHaveBeenCalled();
    expect(out2.session.fields.consent).toBe(true);
    expect(out2.session.step).toBe("baby_name");
    expect(out2.messages.join("\n")).toMatch(/tên/i);
  });

  it("đồng ý consents even if LLM would fail", async () => {
    const s = freshSession({ id: "g-dongy", mode: "guide", termsVersion: "t" });
    s.step = "consent";
    const guideChat = vi.fn(async () => {
      throw new Error("timeout");
    });
    const out = await applyGuideTurn(s, { type: "text", text: "đồng ý" }, baseDeps({ guideChat }));
    expect(guideChat).not.toHaveBeenCalled();
    expect(out.session.fields.consent).toBe(true);
    expect(out.session.step).toBe("baby_name");
  });

  it("negating consent ends deterministically without LLM", async () => {
    const s = freshSession({ id: "g12", mode: "guide", termsVersion: "t" });
    const guideChat = vi.fn(async () => "{}");
    const out = await applyGuideTurn(s, { type: "text", text: "không đồng ý" }, baseDeps({ guideChat }));
    expect(guideChat).not.toHaveBeenCalled();
    expect(out.session.step).toBe("end");
    expect(out.session.fields.consent).toBe(false);
    expect(out.messages.join(" ")).toMatch(/Cảm ơn/);
  });

  it("LLM timeout at photo step asks for photo, not confirm", async () => {
    const s = freshSession({ id: "g13", mode: "guide", termsVersion: "t" });
    s.fields = { ...s.fields, consent: true, consentAt: "t", babyName: "Tủn", displayName: "Tun", gender: "boy", ageRange: "1-2", hobby: "cars", photoOk: false };
    s.step = "photo";
    const out = await applyGuideTurn(s, { type: "text", text: "alo" }, baseDeps({ guideChat: async () => { throw new Error("x"); } }));
    const msg = out.messages.join("\n");
    expect(msg).toMatch(/ảnh/);
    expect(msg).not.toMatch(/xác nhận/);
  });

  it("walks text steps with heuristics when LLM always fails", async () => {
    const fail = vi.fn(async () => {
      throw new Error("timeout");
    });
    const deps = baseDeps({ guideChat: fail });
    let s = freshSession({ id: "g-walk", mode: "guide", termsVersion: "t" });

    // welcome → consent prompt
    let out = await applyGuideTurn(s, { type: "text", text: "ok" }, deps);
    expect(out.session.fields.consent).toBe(false);
    expect(out.session.step).toBe("consent");
    expect(out.messages.join("\n")).toContain("https://terms.example");

    // consent
    out = await applyGuideTurn(out.session, { type: "text", text: "đồng ý" }, deps);
    expect(out.session.fields.consent).toBe(true);
    expect(out.session.step).toBe("baby_name");

    // babyName — previously stuck here on LLM fail
    out = await applyGuideTurn(out.session, { type: "text", text: "Bin" }, deps);
    expect(fail).not.toHaveBeenCalled();
    expect(out.session.fields.babyName).toBe("Bin");
    expect(out.session.step).toBe("display_name");
    expect(out.messages.join("\n")).not.toMatch(/chưa nghe rõ|giải thích lại/i);

    out = await applyGuideTurn(out.session, { type: "text", text: "bé tên Banh Tẹc" }, baseDeps({ guideChat: fail }));
    // already has babyName from Bin walk — start fresh name path:
    s = freshSession({ id: "g-walk2", mode: "guide", termsVersion: "t" });
    s.fields.consent = true;
    s.fields.consentAt = "t";
    s.step = "baby_name";
    out = await applyGuideTurn(s, { type: "text", text: "bé tên Banh Tẹc" }, baseDeps({ guideChat: fail }));
    expect(out.session.fields.babyName).toBe("Banh Tẹc");
    expect(out.session.step).toBe("display_name");

    // displayName keep
    out = await applyGuideTurn(out.session, { type: "text", text: "giữ tên này" }, baseDeps({ guideChat: fail }));
    expect(out.session.fields.displayName).toBe("BanhTẹc");
    expect(out.session.step).toBe("gender");

    // gender
    out = await applyGuideTurn(out.session, { type: "text", text: "bé trai" }, baseDeps({ guideChat: fail }));
    expect(out.session.fields.gender).toBe("boy");
    expect(out.session.step).toBe("age_range");

    // age
    out = await applyGuideTurn(out.session, { type: "text", text: "1-2 tuổi" }, baseDeps({ guideChat: fail }));
    expect(out.session.fields.ageRange).toBe("1-2");
    expect(out.session.step).toBe("hobby");

    // hobby
    out = await applyGuideTurn(out.session, { type: "text", text: "xe hơi" }, baseDeps({ guideChat: fail }));
    expect(out.session.fields.hobby).toBe("cars");
    expect(out.session.step).toBe("photo");
    expect(out.messages.join("\n")).toMatch(/ảnh/i);
  });
});
