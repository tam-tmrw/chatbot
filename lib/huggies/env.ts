import { getLlmProvider } from "@/lib/llm";
import type { GuideDeps } from "@/lib/huggies/agent";
import { extractContextFrom, extractFields } from "@/lib/huggies/ai";
import type { MachineDeps } from "@/lib/huggies/machine";
import type { Session, StepId } from "@/lib/huggies/types";

export function videoUrlsFromEnv(): string[] {
  return (process.env.HUGGIES_VIDEO_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export function huggiesDeps(ai: boolean): MachineDeps {
  return {
    now: () => Date.now(),
    delayMs: Number(process.env.HUGGIES_DELAY_MS ?? 3000),
    newJobId: () => "job_" + crypto.randomUUID(),
    videoUrls: videoUrlsFromEnv(),
    pickVideo: (urls) => urls[Math.floor(Math.random() * urls.length)] ?? "",
    previewUrl: process.env.HUGGIES_PREVIEW_URL || null,
    learnMoreUrl: process.env.HUGGIES_LEARN_MORE_URL || "#",
    termsUrl: process.env.HUGGIES_TERMS_URL || "#",
    extract: ai
      ? (step: StepId, text: string, session: Session) => {
          return extractFields(
            getLlmProvider(),
            step,
            text,
            undefined,
            extractContextFrom(session),
          );
        }
      : undefined,
  };
}

export function huggiesGuideDeps(): GuideDeps {
  const base = huggiesDeps(false);
  return {
    ...base,
    guideTimeoutMs: Number(process.env.HUGGIES_GUIDE_TIMEOUT_MS ?? 5000),
    guideChat: (messages) => getLlmProvider().chat(messages),
  };
}
