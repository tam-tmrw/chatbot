import { describe, expect, it, vi } from "vitest";
import {
  applyTurn,
  freshSession,
  settle,
  type MachineDeps,
} from "@/lib/huggies/machine";
import type { Session, TurnInput } from "@/lib/huggies/types";

function deps(over: Partial<MachineDeps> = {}): MachineDeps {
  return {
    now: () => 1_700_000_000_000,
    delayMs: 3000,
    newJobId: () => "job_1",
    videoUrls: ["https://s3.example/a.mp4"],
    pickVideo: (urls) => urls[0],
    previewUrl: "https://s3.example/preview.jpg",
    learnMoreUrl: "https://huggies.example",
    termsUrl: "https://terms.example",
    ...over,
  };
}

async function say(session: Session, text: string, d = deps()) {
  return applyTurn(session, { type: "text", text }, d);
}

async function toConfirm() {
  let s = freshSession({
    id: "s1",
    scenario: "success",
    mode: "flow",
    termsVersion: "huggies-video-2026-11",
  });
  const rigid = deps({ extract: undefined });
  for (const text of ["1", "1", "Bin", "Bin", "1", "2", "1"]) {
    s = (await say(s, text, rigid)).session;
  }
  const photo = await applyTurn(
    s,
    { type: "image", qc: { ok: true } },
    rigid,
  );
  expect(photo.session.step).toBe("confirm");
  return photo.session;
}

describe("huggies machine", () => {
  it("walks flow rigid path from welcome to confirm with numbers", async () => {
    const session = await toConfirm();
    expect(session.fields.babyName).toBe("Bin");
    expect(session.fields.gender).toBe("boy");
    expect(session.fields.hobby).toBe("cars");
    expect(session.fields.photoOk).toBe(true);
  });

  it("does not overwrite babyName on display_name when extract mislabels", async () => {
    const extract = vi.fn(async () => ({
      babyName: "Wrong",
      displayName: "Bin",
    }));
    let s = freshSession({
      id: "s1",
      scenario: "success",
      mode: "flow",
      termsVersion: "huggies-video-2026-11",
    });
    s = (await say(s, "1")).session;
    s = (await say(s, "1")).session;
    s.fields.babyName = "Bé Bình";
    s.step = "display_name";
    const out = await applyTurn(
      s,
      { type: "text", text: "Bin" },
      deps({ extract }),
    );
    expect(out.session.fields.babyName).toBe("Bé Bình");
    expect(out.session.fields.displayName).toBe("Bin");
  });

  it("jumps to the next missing field when extract fills several", async () => {
    const extract = vi.fn(async () => ({
      babyName: "Bin",
      gender: "boy" as const,
      hobby: "cars" as const,
      reply: "dạ",
    }));
    let s = freshSession({
      id: "s1",
      scenario: "success",
      mode: "flow",
      termsVersion: "huggies-video-2026-11",
    });
    s = (await say(s, "1")).session;
    s = (await say(s, "1")).session;
    const out = await applyTurn(
      s,
      { type: "text", text: "bé tên Bin, con trai, thích xe" },
      deps({ extract }),
    );
    expect(out.session.step).toBe("display_name");
    expect(out.session.fields.hobby).toBe("cars");
    expect(out.messages.join(" ")).not.toContain("dạ");
  });

  it("re-asks the step when extract throws on a multi-field sentence", async () => {
    const extract = vi.fn(async () => {
      throw new Error("bad json");
    });
    let s = freshSession({
      id: "s1",
      scenario: "success",
      mode: "flow",
      termsVersion: "huggies-video-2026-11",
    });
    s = (await say(s, "1")).session;
    s = (await say(s, "1")).session;
    const out = await applyTurn(
      s,
      { type: "text", text: "bé nhà mình tên Bin, con trai" },
      deps({ extract }),
    );
    expect(extract).toHaveBeenCalled();
    expect(out.session.step).toBe("baby_name");
    expect(out.session.fields.babyName).toBeNull();
    expect(out.messages.join(" ")).not.toMatch(/chưa nghe rõ/i);
    expect(out.messages.join(" ")).toMatch(/tên/i);
  });

  it("skips LLM for a bare baby name like Téo", async () => {
    const extract = vi.fn(async () => {
      throw new Error("should not run");
    });
    let s = freshSession({
      id: "s1",
      scenario: "success",
      mode: "flow",
      termsVersion: "huggies-video-2026-11",
    });
    s = (await say(s, "1")).session;
    s = (await say(s, "1")).session;
    const out = await applyTurn(s, { type: "text", text: "Téo" }, deps({ extract }));
    expect(extract).not.toHaveBeenCalled();
    expect(out.session.fields.babyName).toBe("Téo");
    expect(out.session.step).toBe("display_name");
  });

  it("treats oke nha / đồng ý as keep on display_name without re-asking", async () => {
    const extract = vi.fn(async () => {
      throw new Error("should not run");
    });
    let s = freshSession({
      id: "s1",
      scenario: "success",
      mode: "flow",
      termsVersion: "huggies-video-2026-11",
    });
    s = (await say(s, "1")).session;
    s = (await say(s, "1")).session;
    s = (await say(s, "Tủn")).session;
    expect(s.step).toBe("display_name");
    const out = await applyTurn(s, { type: "text", text: "oke nha" }, deps({ extract }));
    expect(extract).not.toHaveBeenCalled();
    expect(out.session.fields.displayName).toBe("Tủn");
    expect(out.session.step).toBe("gender");
    expect(out.messages.join(" ")).toMatch(/Tủn/);
    expect(out.messages.join(" ")).not.toMatch(/Vui lòng cho mình biết tên bé/i);
  });

  it("creates one job and one stable video url", async () => {
    const pickVideo = vi.fn((urls: string[]) => urls[0]);
    const d = deps({ pickVideo, videoUrls: ["https://s3.example/a.mp4", "https://s3.example/b.mp4"] });
    const ready = await toConfirm();
    const first = await applyTurn(ready, { type: "text", text: "1" }, d);
    const second = await applyTurn(first.session, { type: "text", text: "1" }, d);
    expect(first.jobId).toBe("job_1");
    expect(second.jobId).toBe("job_1");
    expect(second.session.job?.readyAt).toBe(first.session.job?.readyAt);
    const done = settle(
      first.session,
      deps({ ...d, now: () => 1_700_000_000_000 + 3000 }),
    );
    const again = settle(done.session, deps({ ...d, now: () => 1_700_000_000_000 + 9000 }));
    expect(done.session.step).toBe("result");
    expect(done.session.job?.videoUrl).toBe("https://s3.example/a.mp4");
    expect(again.session.job?.videoUrl).toBe(done.session.job?.videoUrl);
    expect(pickVideo).toHaveBeenCalledTimes(1);
  });

  it("force-fails a passing photo three times then hands off without a job", async () => {
    let s = freshSession({
      id: "s1",
      scenario: "error_photo_invalid",
      mode: "flow",
      termsVersion: "huggies-video-2026-11",
    });
    for (const text of ["1", "1", "Bin", "Bin", "1", "2", "1"]) {
      s = (await say(s, text)).session;
    }
    expect(s.step).toBe("photo");
    for (let i = 0; i < 2; i += 1) {
      const out = await applyTurn(s, { type: "image", qc: { ok: true } }, deps());
      expect(out.session.step).toBe("photo");
      expect(out.session.job).toBeNull();
      s = out.session;
    }
    const last = await applyTurn(s, { type: "image", qc: { ok: true } }, deps());
    expect(last.session.step).toBe("cs");
    expect(last.session.job).toBeNull();
    expect(last.session.photoFails).toBe(3);
  });

  it("counts a real QC miss and ignores an AWS error", async () => {
    let s = freshSession({
      id: "s1",
      scenario: "success",
      mode: "flow",
      termsVersion: "huggies-video-2026-11",
    });
    for (const text of ["1", "1", "Bin", "Bin", "1", "2", "1"]) {
      s = (await say(s, text)).session;
    }
    const aws = await applyTurn(s, { type: "image", qc: { awsError: true } }, deps());
    expect(aws.session.photoFails).toBe(0);
    const bad = await applyTurn(
      aws.session,
      { type: "image", qc: { ok: false, reason: "multi_face" } },
      deps(),
    );
    expect(bad.session.photoFails).toBe(1);
    expect(bad.messages.join(" ")).toContain("nhiều hơn 1 khuôn mặt");
    const typed = await applyTurn(bad.session, { type: "text", text: "hello" }, deps());
    expect(typed.session.photoFails).toBe(1);
  });

  it("fails render twice on retry and then removes retry", async () => {
    let s = await toConfirm();
    s.channel = "messenger";
    s.scenario = "error_render";
    s = (await applyTurn(s, { type: "text", text: "1" }, deps())).session;
    const clock = { t: 1_700_000_000_000 + 3000 };
    let out = settle(s, deps({ now: () => clock.t }));
    expect(out.session.step).toBe("error");
    expect(out.buttons.map((b) => b.id)).toContain("retry");
    out = await applyTurn(out.session, { type: "button", buttonId: "retry" }, deps());
    clock.t += 3000;
    out = settle(out.session, deps({ now: () => clock.t }));
    expect(out.buttons.map((b) => b.id)).toContain("retry");
    out = await applyTurn(out.session, { type: "button", buttonId: "retry" }, deps());
    clock.t += 3000;
    out = settle(out.session, deps({ now: () => clock.t }));
    expect(out.session.job?.retries).toBe(2);
    expect(out.session.job?.errorCode).toBe("render_fail");
    expect(out.buttons.map((b) => b.id)).not.toContain("retry");
    expect(out.buttons.map((b) => b.id)).toContain("cs");
  });

  it("guide welcome is free-text without numbered start", async () => {
    const { promptFor } = await import("@/lib/huggies/copy");
    const { freshSession } = await import("@/lib/huggies/machine");
    const s = freshSession({ id: "gw", mode: "guide", termsVersion: "t" });
    const p = promptFor(s);
    expect(p.text).not.toMatch(/gõ số|1\.\s/);
    expect(p.text).toMatch(/Huggies|chiến dịch|ba mẹ/i);
    expect(p.text).toMatch(/bắt đầu|điều khoản|ảnh/i);
    expect(p.buttons).toEqual([]);
  });

  it("zalo surface embeds numbered options and hides buttons", async () => {
    const { promptFor } = await import("@/lib/huggies/copy");
    const s = freshSession({
      id: "z1",
      scenario: "success",
      channel: "zalo",
      mode: "flow",
      termsVersion: "huggies-video-2026-11",
    });
    const welcome = promptFor(s);
    expect(welcome.buttons).toEqual([]);
    expect(welcome.text).toMatch(/1\.\s*.*Bắt đầu/);
    const consent = await say(s, "1");
    expect(consent.buttons).toEqual([]);
    expect(consent.messages.join("\n")).toMatch(/1\.\s*.*Đồng ý/);
    expect(consent.messages.join("\n")).toMatch(/2\.\s*.*điều khoản/i);
  });

  it("reports an empty video list without a url", async () => {
    const ready = await toConfirm();
    const started = await applyTurn(ready, { type: "text", text: "1" }, deps({ videoUrls: [] }));
    const done = settle(started.session, deps({
      videoUrls: [],
      now: () => 1_700_000_000_000 + 3000,
    }));
    expect(done.session.step).toBe("error");
    expect(done.session.job?.videoUrl).toBeNull();
    expect(done.session.job?.errorCode).toBe("config");
    expect(done.messages.join(" ")).not.toContain("Error:");
  });
});
