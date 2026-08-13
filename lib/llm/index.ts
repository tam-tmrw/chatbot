import { createOpenAiProvider } from "@/lib/llm/openai";
import type { LlmProvider } from "@/lib/llm/types";

export type { ChatMessage, LlmProvider } from "@/lib/llm/types";

export function getLlmProvider(): LlmProvider {
  const provider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
  if (provider === "openai") return createOpenAiProvider();
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}
