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

export function parseBabyName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  if (/https?:\/\//i.test(name)) return null;
  if (!/[\p{L}\p{N}]/u.test(name)) return null;
  return name;
}

export function parseDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > 12) return null;
  if (/[<>]/.test(name)) return null;
  if (/\s/.test(name)) return null;
  return name;
}

export function parseGenderToken(raw: string): Gender | null {
  if (raw.trim() === "1") return "boy";
  if (raw.trim() === "2") return "girl";
  if (raw.trim() === "3") return "unspecified";
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
