import { readFileSync } from "node:fs";
import path from "node:path";
import { loadKnowledgeContext } from "@/lib/knowledge/loader";

export function buildSystemPrompt(userText: string): string {
  const root = process.cwd();
  const system = readFileSync(path.join(root, "prompts/system.md"), "utf8");
  const few = readFileSync(path.join(root, "prompts/fewshots.md"), "utf8");
  const kb = loadKnowledgeContext(userText);
  return `${system}\n\n【KNOWLEDGE】\n${kb}\n\n【FEWSHOTS】\n${few}`;
}
