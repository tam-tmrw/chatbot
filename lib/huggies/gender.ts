import { foldVn } from "@/lib/conversation/flow";
import type { Gender } from "@/lib/huggies/types";
import { parseGenderToken } from "@/lib/huggies/validate";

/** Parse gender from button id, menu number, or natural VN/EN text. */
export function parseGenderInput(raw: string | null | undefined): Gender | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (text === "boy" || text === "girl" || text === "unspecified") return text;
  const fromToken = parseGenderToken(text);
  if (fromToken) return fromToken;

  const t = foldVn(text);
  // Girl before boy — avoid rare overlap; require clear tokens.
  if (/\b(be\s+gai|gai|girl|nu|female)\b/.test(t)) return "girl";
  if (/\b(be\s+trai|trai|boy|nam|male)\b/.test(t)) return "boy";
  if (/\b(khong neu|khong noi|khong noi gi|unspecified)\b/.test(t)) return "unspecified";
  return null;
}
