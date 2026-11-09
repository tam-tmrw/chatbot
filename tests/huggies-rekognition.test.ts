import { describe, expect, it, vi } from "vitest";
import { detectFaceFacts } from "@/lib/huggies/rekognition";

describe("detectFaceFacts", () => {
  it("maps one face and a second person instance", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        FaceDetails: [
          {
            Confidence: 98,
            Quality: { Brightness: 70, Sharpness: 80 },
            Pose: { Yaw: 5, Pitch: -3 },
            FaceOccluded: { Value: false },
          },
        ],
      })
      .mockResolvedValueOnce({
        Labels: [{ Name: "Person", Instances: [{}, {}] }],
      });
    const facts = await detectFaceFacts(new Uint8Array([1]), { send });
    expect(facts.faceCount).toBe(1);
    expect(facts.personCount).toBe(2);
    expect(facts.confidence).toBe(98);
    expect(facts.occluded).toBe(false);
    expect(facts.yaw).toBe(5);
  });

  it("returns zeros when AWS finds nothing", async () => {
    const send = vi.fn().mockResolvedValue({});
    const facts = await detectFaceFacts(new Uint8Array([1]), { send });
    expect(facts.faceCount).toBe(0);
    expect(facts.personCount).toBe(0);
  });
});
