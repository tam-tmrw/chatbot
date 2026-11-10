import { foldVn } from "@/lib/conversation/flow";
import type { AgeRange, Gender, HobbyId } from "@/lib/huggies/types";

export const HOBBIES: { id: HobbyId; label: string }[] = [
  { id: "cars", label: "Xe hơi" },
  { id: "animals", label: "Động vật" },
  { id: "music", label: "Âm nhạc" },
  { id: "dance", label: "Nhảy múa" },
  { id: "sports", label: "Thể thao" },
  { id: "princess", label: "Công chúa / cổ tích" },
  { id: "space", label: "Vũ trụ" },
  { id: "art", label: "Vẽ / sáng tạo" },
  { id: "toys", label: "Đồ chơi" },
  { id: "nature", label: "Thiên nhiên" },
];

/** Words / phrases that are not baby names (cancel, filler, English crumbs). */
const NAME_BLOCK = new Set([
  "no",
  "yes",
  "ok",
  "okay",
  "hi",
  "hello",
  "hey",
  "test",
  "ten",
  "ten be",
  "ten gi",
  "khong",
  "ko",
  "khong choi",
  "khong choi nua",
  "thoi",
  "thoi di",
  "dung",
  "stop",
  "end",
  "bye",
  "sao",
  "sao ha",
  "gi",
  "u",
  "um",
  "a",
  "da",
  "uh",
  "hmm",
  "hmmm",
]);

function looksLikeNameToken(name: string): boolean {
  const folded = foldVn(name);
  if (NAME_BLOCK.has(folded)) return false;
  if (folded.length < 2) return false;
  if (/^(khong|ko)\b/.test(folded)) return false;
  return true;
}

/** Soft yes / keep — used on display_name & confirm. */
export function isAffirmative(raw: string): boolean {
  const t = foldVn(raw.trim()).replace(/[.!？?]+$/g, "");
  if (!t || t.length > 40) return false;
  if (
    /^(ok|oke|okay|yes|y|u|uh|um|vang|vangu|dong y|duoc|duoc roi|duoc nha|giu|giu ten|giu ten nay|giu nguyen|dung roi|chuan|oke nha|ok nha|oke a|ok a|uh huh|dong y nha|ok luon|oke luon|yes nha)$/.test(
      t,
    )
  ) {
    return true;
  }
  // short phrases starting with ok / đồng ý / giữ / được
  if (t.split(/\s+/).length <= 4 && /^(ok|oke|okay|dong y|duoc|giu|vang)\b/.test(t)) {
    return true;
  }
  return false;
}

export function parseBabyName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  if (/https?:\/\//i.test(name)) return null;
  if (!/[\p{L}\p{N}]/u.test(name)) return null;
  if (!looksLikeNameToken(name)) return null;
  return name;
}

export function parseDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > 12) return null;
  if (/[<>]/.test(name)) return null;
  if (/\s/.test(name)) return null;
  if (!looksLikeNameToken(name)) return null;
  return name;
}

export function parseGenderToken(raw: string): Gender | null {
  if (raw.trim() === "1") return "boy";
  if (raw.trim() === "2") return "girl";
  return null;
}

export function parseAgeToken(raw: string): AgeRange | null {
  const n = raw.trim();
  if (n === "1") return "<1";
  if (n === "2") return "1-2";
  if (n === "3") return "2-3";
  if (n === "4") return ">3";
  return null;
}

export function parseHobbyToken(raw: string): HobbyId | null {
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > HOBBIES.length) return null;
  return HOBBIES[n - 1].id;
}
