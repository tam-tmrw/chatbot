import { foldVn } from "@/lib/conversation/flow";
import type { Fields } from "@/lib/huggies/types";
import { HOBBIES } from "@/lib/huggies/validate";

export type TextFieldKey =
  | "consent"
  | "babyName"
  | "displayName"
  | "gender"
  | "ageRange"
  | "hobby";

const GENDER_LABEL = { boy: "Bé trai", girl: "Bé gái", unspecified: "Không nêu" } as const;
const AGE_LABEL = {
  "<1": "Dưới 1 tuổi",
  "1-2": "1–2 tuổi",
  "2-3": "2–3 tuổi",
  ">3": "Trên 3 tuổi",
} as const;

export function consentPrompt(termsUrl: string): string {
  const url = termsUrl.trim() || "#";
  return [
    "Trước khi bắt đầu, mình cần ba mẹ đồng ý Điều khoản sử dụng ảnh để tạo video (ảnh chỉ dùng cho mục đích này).",
    `Điều khoản: ${url}`,
    "Ba mẹ trả lời “đồng ý” để tiếp tục, hoặc “không đồng ý” nếu muốn dừng nhé.",
  ].join("\n");
}

export function looksLikeTermsAsk(text: string): boolean {
  const t = foldVn(text);
  if (/\b(dong y|khong dong y)\b/.test(t) && !/dieu khoan|link|url|xem/.test(t)) {
    return false;
  }
  return /dieu khoan|link dieu khoan|xem dieu khoan|\blink\b|\burl\b|cho xem/.test(t);
}

function hobbyHint(): string {
  const labels = HOBBIES.map((h) => h.label).join(", ");
  return `Bé thích gì nhất ạ? Chọn một trong: ${labels}.`;
}

export function confirmSummary(fields: Fields): string {
  const hobby = HOBBIES.find((h) => h.id === fields.hobby)?.label ?? "";
  return [
    "Mình tóm tắt lại cho ba mẹ kiểm tra nhé:",
    `Tên: ${fields.babyName ?? ""}`,
    `Tên trên video: ${fields.displayName ?? ""}`,
    `Giới tính: ${fields.gender ? GENDER_LABEL[fields.gender] : ""}`,
    `Độ tuổi: ${fields.ageRange ? AGE_LABEL[fields.ageRange] : ""}`,
    `Sở thích: ${hobby}`,
    `Ảnh: ${fields.photoOk ? "đã nhận" : "chưa có"}`,
    "",
    "Ba mẹ xác nhận tạo video giúp mình nhé?",
  ].join("\n");
}

export const PHOTO_ASK = "Thông tin đủ rồi ạ. Ba mẹ gửi 1 ảnh mặt bé rõ, nhìn thẳng, đủ sáng nhé.";

const HINTS: Record<Exclude<TextFieldKey, "consent" | "hobby">, string> = {
  babyName: "Bé nhà mình tên gì ạ? Ví dụ: Bin, Minh Anh.",
  displayName:
    "Tên trên video tối đa 12 ký tự, viết liền. Ví dụ: Bin, MinhAnh — hoặc nói “giữ tên này”.",
  gender: "Bé là bé trai, bé gái, hay không nêu ạ?",
  ageRange: "Bé đang ở độ tuổi nào ạ? (dưới 1 / 1–2 / 2–3 / trên 3)",
};

export function missingTextKeys(fields: Fields): TextFieldKey[] {
  const missing: TextFieldKey[] = [];
  if (!fields.consent) missing.push("consent");
  if (!fields.babyName) missing.push("babyName");
  if (!fields.displayName) missing.push("displayName");
  if (!fields.gender) missing.push("gender");
  if (!fields.ageRange) missing.push("ageRange");
  if (!fields.hobby) missing.push("hobby");
  return missing;
}

export function textFieldsComplete(fields: Fields): boolean {
  return missingTextKeys(fields).length === 0;
}

export function firstMissingHint(
  fields: Fields,
  opts?: { termsUrl?: string },
): string {
  const key = missingTextKeys(fields)[0];
  if (!key) return fields.photoOk ? confirmSummary(fields) : PHOTO_ASK;
  if (key === "consent") return consentPrompt(opts?.termsUrl ?? "#");
  if (key === "hobby") return hobbyHint();
  return HINTS[key];
}
