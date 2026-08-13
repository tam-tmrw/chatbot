import { readFileSync } from "node:fs";
import path from "node:path";
import { loadKnowledgeContext } from "@/lib/knowledge/loader";

export function buildSystemPrompt(
  userText: string,
  stage?: string | null,
  missing?: string[],
): string {
  const root = process.cwd();
  const system = readFileSync(path.join(root, "prompts/system.md"), "utf8");
  const few = readFileSync(path.join(root, "prompts/fewshots.md"), "utf8");
  const kb = loadKnowledgeContext(userText);
  const stageLine = stage
    ? `\n\n【CURRENT STAGE】${stage} — làm đúng bước tương ứng trong CONVERSATION FLOW.`
    : "";
  const missingLine =
    missing?.length
      ? `\n【LEAD PROFILE — còn thiếu】${missing.join(", ")} — hỏi đúng 1 field tiếp theo: name=tên gọi, region=khu vực sinh sống/hộ khẩu (chỉ tỉnh/thành VN hợp lệ), finance=tiền mặt hay trả góp (+ ngân sách nếu có), phone=SĐT VN 10 số. SĐT/địa chỉ sai → hỏi lại, không ghi nhận. Không bịa lãi/lăn bánh.`
      : "";
  return `${system}${stageLine}${missingLine}\n\n【KNOWLEDGE】\n${kb}\n\n【FEWSHOTS】\n${few}`;
}
