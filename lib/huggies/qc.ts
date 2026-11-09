import type { FaceFacts, QcReason } from "@/lib/huggies/types";

export const QC_THRESHOLDS = {
  minConfidence: 90,
  minBrightness: 40,
  minSharpness: 40,
  maxYaw: 25,
  maxPitch: 25,
  minEdge: 400,
  maxBytes: 5_000_000,
};

export function judgeFace(
  facts: FaceFacts,
): { ok: true } | { ok: false; reason: QcReason } {
  const t = QC_THRESHOLDS;
  if (facts.minEdge < t.minEdge) return { ok: false, reason: "low_res" };
  if (facts.faceCount <= 0) return { ok: false, reason: "no_face" };
  if (facts.faceCount > 1) return { ok: false, reason: "multi_face" };
  if (facts.personCount > 1) return { ok: false, reason: "other_person" };
  if (facts.confidence < t.minConfidence) return { ok: false, reason: "no_face" };
  if (facts.occluded) return { ok: false, reason: "covered" };
  if (facts.brightness < t.minBrightness) return { ok: false, reason: "too_dark" };
  if (facts.sharpness < t.minSharpness) return { ok: false, reason: "blurry" };
  if (Math.abs(facts.yaw) > t.maxYaw || Math.abs(facts.pitch) > t.maxPitch) {
    return { ok: false, reason: "not_frontal" };
  }
  return { ok: true };
}
