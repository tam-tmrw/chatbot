import { readFileSync } from "node:fs";
import path from "node:path";
import { loadKnowledgeContext } from "@/lib/knowledge/loader";

export function buildSystemPrompt(
  userText: string,
  missing?: string[],
): string {
  const root = process.cwd();
  const system = readFileSync(path.join(root, "prompts/system.md"), "utf8");
  const few = readFileSync(path.join(root, "prompts/fewshots.md"), "utf8");
  const kb = loadKnowledgeContext(userText);
  const missingLine =
    missing?.length
      ? `\n【LEAD PROFILE — còn thiếu】${missing.join(", ")} — hỏi đúng 1 field: name=tên gọi, region=tỉnh/thành VN, finance=tiền mặt/trả góp, phone=SĐT 10 số VN. Sai SĐT/địa chỉ thì hỏi lại, không ghi nhận. Không bịa lãi/lăn bánh.`
      : "";
  return `${system}${missingLine}\n\n【KNOWLEDGE】\n${kb}\n\n【FEWSHOTS】\n${few}`;
}
