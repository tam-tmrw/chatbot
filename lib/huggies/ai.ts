import type { LlmProvider } from "@/lib/llm";
import type { Extracted, HobbyId, Session, StepId } from "@/lib/huggies/types";
import {
  HOBBIES,
  isAffirmative,
  parseBabyName,
  parseDisplayName,
} from "@/lib/huggies/validate";

const HOBBY_IDS = new Set<string>(HOBBIES.map((h) => h.id));

export type ExtractContext = {
  babyName?: string | null;
  displayName?: string | null;
};

function systemFor(step: StepId, ctx: ExtractContext): string {
  const offered =
    (ctx.babyName ?? "").replace(/\s+/g, "").slice(0, 12) || null;
  return `Bạn là trợ lý Huggies, tiếng Việt thân thiện như chăm sóc khách trên chat.
Chỉ trả về ĐÚNG MỘT object JSON (không markdown).
Keys: babyName, displayName, gender (boy|girl|null), ageRange (<1|1-2|2-3|>3|null), hobby (cars|animals|music|dance|sports|princess|space|art|toys|nature|null), confirm boolean, reply string|null.

Quy tắc chung:
- "reply" chỉ tiếng Việt, ngắn, ấm. CẤM tiếng Anh.
- Không bịa sở thích. Không suy giới tính từ ảnh.
- Chỉ điền field liên quan bước hiện tại (trừ khi user nêu rõ nhiều field trong một câu).
- Không lấy filler/từ chối ("không", "thôi", "sao", "test") làm tên.

Bước hiện tại: ${step}
Tên bé đã có: ${ctx.babyName ?? "(chưa có)"}
Tên đề xuất trên video (viết liền ≤12): ${offered ?? "(chưa có)"}

Riêng bước display_name:
- Nếu user đồng ý / ok / oke / được / giữ / đồng ý nha → đặt displayName = tên đề xuất trên video ở trên (không hỏi lại tên bé).
- Nếu user đưa biệt danh mới hợp lệ → displayName = biệt danh viết liền ≤12.
- CẤM hỏi lại "tên bé" khi đang ở display_name; chỉ hỏi biệt danh trên video nếu cần.

Riêng bước confirm:
- Đồng ý / ok / tạo đi → confirm=true.
- Muốn sửa → confirm=false, reply hỏi muốn sửa gì.

Nếu chưa rõ: để field null và reply gợi ý nhẹ kèm ví dụ.`;
}

/** Drop English LLM replies so the UI never shows them. */
export function sanitizeReply(reply: string | null | undefined): string | null {
  if (!reply?.trim()) return null;
  if (
    /please|provide|baby'?s?\s+name|can you|could you|i need|sorry,?\s+i|what is the/i.test(
      reply,
    )
  ) {
    return null;
  }
  return reply.trim();
}

export async function extractFields(
  llm: LlmProvider,
  step: StepId,
  text: string,
  timeoutMs = Number(process.env.HUGGIES_LLM_TIMEOUT_MS ?? 8000),
  ctx: ExtractContext = {},
): Promise<Extracted> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM timeout")), timeoutMs);
  });
  try {
    const raw = await Promise.race([
      llm.chat([
        { role: "system", content: systemFor(step, ctx) },
        { role: "user", content: text },
      ]),
      timeout,
    ]);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("invalid json");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const out: Extracted = {};
    if (typeof parsed.babyName === "string") {
      const name = parseBabyName(parsed.babyName);
      if (name) out.babyName = name;
    }
    if (typeof parsed.displayName === "string") {
      const name = parseDisplayName(parsed.displayName);
      if (name) out.displayName = name;
    }
    // Defense: model ignored affirmatives — still keep offered name
    if (step === "display_name" && !out.displayName && ctx.babyName && isAffirmative(text)) {
      const kept = parseDisplayName(ctx.babyName.replace(/\s+/g, "").slice(0, 12));
      if (kept) out.displayName = kept;
    }
    if (parsed.gender === "boy" || parsed.gender === "girl") {
      out.gender = parsed.gender;
    }
    if (
      parsed.ageRange === "<1" ||
      parsed.ageRange === "1-2" ||
      parsed.ageRange === "2-3" ||
      parsed.ageRange === ">3"
    ) {
      out.ageRange = parsed.ageRange;
    }
    if (typeof parsed.hobby === "string" && HOBBY_IDS.has(parsed.hobby)) {
      out.hobby = parsed.hobby as HobbyId;
    }
    if (parsed.confirm === true) out.confirm = true;
    if (typeof parsed.reply === "string") {
      const reply = sanitizeReply(parsed.reply);
      if (reply) out.reply = reply;
    }
    return out;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function extractContextFrom(session: Session): ExtractContext {
  return {
    babyName: session.fields.babyName,
    displayName: session.fields.displayName,
  };
}
