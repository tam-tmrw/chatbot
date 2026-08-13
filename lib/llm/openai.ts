import OpenAI from "openai";
import type { ChatMessage, LlmProvider } from "@/lib/llm/types";

export function createOpenAiProvider(opts?: {
  apiKey?: string;
  model?: string;
}): LlmProvider {
  const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = opts?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  return {
    async chat(messages: ChatMessage[]): Promise<string> {
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty LLM response");
      return text;
    },
  };
}
