import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import {
  huggiesDeps,
  videoUrlsBoyFromEnv,
  videoUrlsGirlFromEnv,
} from "@/lib/huggies/env";
import { parseGenderInput } from "@/lib/huggies/gender";
import {
  applyTurn,
  freshSession,
  settle,
  videoPoolForGender,
} from "@/lib/huggies/machine";

config({ path: ".env" });

describe("gender video pool", () => {
  it("parses bé gái / gái as girl (not boy)", () => {
    expect(parseGenderInput("gái")).toBe("girl");
    expect(parseGenderInput("bé gái")).toBe("girl");
    expect(parseGenderInput("gái hen")).toBe("girl");
    expect(parseGenderInput("girl")).toBe("girl");
    expect(parseGenderInput("2")).toBe("girl");
    expect(parseGenderInput("bé trai")).toBe("boy");
    expect(parseGenderInput("1")).toBe("boy");
  });

  it("env boy/girl pools are distinct when configured", () => {
    const boy = videoUrlsBoyFromEnv();
    const girl = videoUrlsGirlFromEnv();
    if (boy.length === 0 || girl.length === 0) return; // CI without .env urls
    expect(boy[0]).toMatch(/boy/i);
    expect(girl[0]).toMatch(/girl/i);
    expect(videoPoolForGender("girl", huggiesDeps(false))[0]).toMatch(/girl/i);
    expect(videoPoolForGender("boy", huggiesDeps(false))[0]).toMatch(/boy/i);
  });

  it("settle picks girl pool when genderSnap is girl", async () => {
    const deps = {
      ...huggiesDeps(false),
      now: () => 1_700_000_000_000,
      delayMs: 0,
      videoUrls: ["https://s3.example/fallback.mp4"],
      videoUrlsBoy: ["https://s3.example/boy.mp4"],
      videoUrlsGirl: ["https://s3.example/girl.mp4"],
      pickVideo: (urls: string[]) => urls[0],
    };
    const s = freshSession({ id: "g-girl", mode: "flow", termsVersion: "t" });
    s.fields = {
      ...s.fields,
      consent: true,
      consentAt: "t",
      babyName: "Na",
      displayName: "Na",
      gender: "girl",
      ageRange: "1-2",
      hobby: "animals",
      photoOk: true,
    };
    s.step = "confirm";
    const started = await applyTurn(s, { type: "text", text: "1" }, deps);
    expect(started.session.job?.genderSnap).toBe("girl");
    const done = settle(started.session, { ...deps, now: () => 1_700_000_000_000 + 1 });
    expect(done.session.job?.videoUrl).toBe("https://s3.example/girl.mp4");
  });
});
