import { describe, expect, it } from "vitest";
import { imageMinEdge } from "@/lib/huggies/image";
import { judgeFace, QC_THRESHOLDS } from "@/lib/huggies/qc";
import type { FaceFacts } from "@/lib/huggies/types";
import {
  parseAgeToken,
  parseBabyName,
  parseDisplayName,
  parseGenderToken,
  parseHobbyToken,
} from "@/lib/huggies/validate";

const passFacts = (): FaceFacts => ({
  faceCount: 1,
  personCount: 1,
  confidence: 99,
  brightness: 80,
  sharpness: 80,
  yaw: 0,
  pitch: 0,
  occluded: false,
  minEdge: 800,
});

describe("huggies rules", () => {
  it("parses names and enum tokens", () => {
    expect(parseBabyName("  Bin  ")).toBe("Bin");
    expect(parseBabyName("https://x")).toBeNull();
    expect(parseBabyName("😀")).toBeNull();
    expect(parseDisplayName("Bình An nè")).toBeNull();
    expect(parseDisplayName("Bin")).toBe("Bin");
    expect(parseGenderToken("2")).toBe("girl");
    expect(parseAgeToken("2")).toBe("1-2");
    expect(parseHobbyToken("1")).toBe("cars");
    expect(parseHobbyToken("11")).toBeNull();
  });

  it("passes one clear face and rejects the pitch failure modes", () => {
    expect(judgeFace(passFacts()).ok).toBe(true);
    expect(judgeFace({ ...passFacts(), faceCount: 0 }).ok).toBe(false);
    expect(judgeFace({ ...passFacts(), faceCount: 2 })).toEqual({
      ok: false,
      reason: "multi_face",
    });
    expect(judgeFace({ ...passFacts(), personCount: 2 })).toEqual({
      ok: false,
      reason: "other_person",
    });
    expect(judgeFace({ ...passFacts(), sharpness: 10 })).toEqual({
      ok: false,
      reason: "blurry",
    });
    expect(judgeFace({ ...passFacts(), brightness: 10 })).toEqual({
      ok: false,
      reason: "too_dark",
    });
    expect(judgeFace({ ...passFacts(), occluded: true })).toEqual({
      ok: false,
      reason: "covered",
    });
    expect(judgeFace({ ...passFacts(), minEdge: 100 })).toEqual({
      ok: false,
      reason: "low_res",
    });
    expect(judgeFace({ ...passFacts(), yaw: 40 })).toEqual({
      ok: false,
      reason: "not_frontal",
    });
    expect(QC_THRESHOLDS.maxBytes).toBe(5_000_000);
  });

  it("reads a PNG min edge and rejects unknown bytes", () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    const view = new DataView(png.buffer);
    view.setUint32(16, 400);
    view.setUint32(20, 640);
    expect(imageMinEdge(png)).toBe(400);
    expect(imageMinEdge(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
