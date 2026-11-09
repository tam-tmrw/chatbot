import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/huggies/rekognition", () => ({
  detectFaceFacts: vi.fn(async () => ({
    faceCount: 1,
    personCount: 1,
    confidence: 99,
    brightness: 80,
    sharpness: 80,
    yaw: 0,
    pitch: 0,
    occluded: false,
    minEdge: 0,
  })),
}));

vi.mock("@/lib/huggies/ai", () => ({
  extractFields: vi.fn(async () => {
    throw new Error("bad json");
  }),
}));

import { POST as createSession } from "@/app/api/huggies/session/route";
import { POST as postMessage } from "@/app/api/huggies/message/route";
import { GET as getJob } from "@/app/api/huggies/job/route";
import { resetHuggiesStore } from "@/lib/huggies/store";

function authed(url: string, body?: unknown) {
  return new Request(url, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      cookie: "vi_demo_huggies=1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("huggies API", () => {
  beforeEach(() => {
    resetHuggiesStore();
    process.env.HUGGIES_DELAY_MS = "0";
    process.env.HUGGIES_VIDEO_URLS = "https://s3.example/a.mp4";
    process.env.HUGGIES_TERMS_VERSION = "huggies-video-2026-11";
  });

  it("rejects a missing cookie", async () => {
    const res = await createSession(
      new Request("http://localhost/api/huggies/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "success", ai: false }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns a video url once for success", async () => {
    const created = await createSession(
      authed("http://localhost/api/huggies/session", { scenario: "success", ai: false }),
    );
    const start = await created.json();
    let sessionId = start.sessionId as string;
    for (const text of ["1", "1", "Bin", "Bin", "1", "2", "1"]) {
      const res = await postMessage(
        authed("http://localhost/api/huggies/message", {
          sessionId,
          type: "text",
          text,
        }),
      );
      expect(res.status).toBe(200);
    }
    const png = Buffer.alloc(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.writeUInt32BE(400, 16);
    png.writeUInt32BE(400, 20);
    const photo = await postMessage(
      authed("http://localhost/api/huggies/message", {
        sessionId,
        type: "image",
        mime: "image/png",
        imageBase64: png.toString("base64"),
      }),
    );
    expect((await photo.json()).step).toBe("confirm");
    const confirmed = await postMessage(
      authed("http://localhost/api/huggies/message", {
        sessionId,
        type: "text",
        text: "1",
      }),
    );
    const body = await confirmed.json();
    expect(body.jobId).toBeTruthy();
    const job = await getJob(
      authed(`http://localhost/api/huggies/job?sessionId=${sessionId}`),
    );
    const done = await job.json();
    expect(done.step).toBe("result");
    expect(done.job.videoUrl).toBe("https://s3.example/a.mp4");
    const again = await getJob(
      authed(`http://localhost/api/huggies/job?sessionId=${sessionId}`),
    );
    const second = await again.json();
    expect(second.job.videoUrl).toBe(done.job.videoUrl);
    expect(second.messages).toEqual([]);
  });
});
