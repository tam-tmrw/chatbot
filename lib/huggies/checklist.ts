import type { Fields } from "@/lib/huggies/types";

export type TextFieldKey =
  | "consent"
  | "babyName"
  | "displayName"
  | "gender"
  | "ageRange"
  | "hobby";

const HINTS: Record<TextFieldKey, string> = {
  consent: "Ba mẹ đồng ý Điều khoản giúp mình để bắt đầu nhé (trả lời “đồng ý”).",
  babyName: "Bé nhà mình tên gì ạ? Ví dụ: Bin, Minh Anh.",
  displayName:
    "Tên trên video tối đa 12 ký tự, viết liền. Ví dụ: Bin, MinhAnh — hoặc nói “giữ tên này”.",
  gender: "Bé là bé trai, bé gái, hay không nêu ạ?",
  ageRange: "Bé đang ở độ tuổi nào ạ? (dưới 1 / 1–2 / 2–3 / trên 3)",
  hobby: "Bé thích gì nhất ạ? (xe hơi, động vật, âm nhạc, …)",
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

export function firstMissingHint(fields: Fields): string {
  const key = missingTextKeys(fields)[0];
  return key ? HINTS[key] : "Ba mẹ xác nhận tạo video giúp mình nhé.";
}
