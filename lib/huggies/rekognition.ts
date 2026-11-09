import {
  DetectFacesCommand,
  DetectLabelsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import type { FaceFacts } from "@/lib/huggies/types";

type Sender = { send: (cmd: unknown) => Promise<unknown> };

export function defaultRekognitionClient(): Sender {
  return new RekognitionClient({ region: process.env.AWS_REGION });
}

export async function detectFaceFacts(
  bytes: Uint8Array,
  client: Sender = defaultRekognitionClient(),
): Promise<FaceFacts> {
  const faces = (await client.send(
    new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["ALL"] }),
  )) as {
    FaceDetails?: Array<{
      Confidence?: number;
      Quality?: { Brightness?: number; Sharpness?: number };
      Pose?: { Yaw?: number; Pitch?: number };
      FaceOccluded?: { Value?: boolean };
    }>;
  };
  const labels = (await client.send(
    new DetectLabelsCommand({ Image: { Bytes: bytes }, MaxLabels: 20 }),
  )) as { Labels?: Array<{ Name?: string; Instances?: unknown[] }> };
  const details = faces.FaceDetails ?? [];
  const face = details[0];
  const person = (labels.Labels ?? []).find((label) => label.Name === "Person");
  const personCount = person
    ? person.Instances?.length
      ? person.Instances.length
      : 1
    : details.length;
  return {
    faceCount: details.length,
    personCount,
    confidence: face?.Confidence ?? 0,
    brightness: face?.Quality?.Brightness ?? 0,
    sharpness: face?.Quality?.Sharpness ?? 0,
    yaw: face?.Pose?.Yaw ?? 0,
    pitch: face?.Pose?.Pitch ?? 0,
    occluded: Boolean(face?.FaceOccluded?.Value),
    minEdge: 0,
  };
}
