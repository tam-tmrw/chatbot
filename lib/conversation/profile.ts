import {
  extractVnPhone,
  looksLikeInvalidPhone,
} from "@/lib/conversation/intent";
import { extractProvince } from "@/lib/conversation/flow";

export type LeadProfile = {
  name: string | null;
  region: string | null;
  finance: string | null;
  phone: string | null;
};

export type LeadField = keyof LeadProfile;

const NAME_STOP =
  /^(người|muốn|đang|rất|quan|thích|hợp|ok|ừ|uh|anh|chị|em|bạn|mai|pali|fan)/i;

function looksLikeName(raw: string): boolean {
  const s = raw.trim().replace(/[.,!?]+$/g, "");
  const parts = s.split(/\s+/);
  if (parts.length < 1 || parts.length > 4) return false;
  if (parts.some((p) => p.length < 2 || NAME_STOP.test(p))) return false;
  if (/palisade|hyundai|lái|thử|giá|tỷ|góp|sđt|điện/i.test(s)) return false;
  return true;
}

export function extractName(text: string): string | null {
  const re =
    /(?:tên(?:\s+(?:mình|tôi|em|anh|chị))?(?:\s+là)?|(?:mình|tôi|em|anh|chị)\s+tên(?:\s+là)?|(?:mình|tôi)\s+là)\s+([A-Za-zÀ-ỹĐđ]+(?:\s+[A-Za-zÀ-ỹĐđ]+){0,3})/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (looksLikeName(m[1])) last = m[1].trim();
  }
  return last;
}

export function extractFinance(text: string): string | null {
  const t = text.toLowerCase().trim();
  // ponytail: discover chip is nhu cầu, not personal payment method
  if (/^trả góp\s*\/\s*tài chính$/.test(t)) return null;

  const budget = t.match(/(\d+[.,]?\d*)\s*(tỷ|triệu)/);
  if (/tiền mặt|trả thẳng|cash|không góp/.test(t)) {
    return budget ? `Tiền mặt (~${budget[1]} ${budget[2]})` : "Tiền mặt";
  }
  if (/trả góp|vay ngân hàng|đặt cọc/.test(t)) {
    return budget ? `Trả góp (~${budget[1]} ${budget[2]})` : "Trả góp";
  }
  if (/ngân sách|tầm|khoảng|cỡ/.test(t) && budget) {
    return `Ngân sách ~${budget[1]} ${budget[2]}`;
  }
  return null;
}

const LOCATION_CUE =
  /(?:sống tại|sinh sống|khu vực|quê(?:\s+ở)?|mình ở|đăng ký biển|hộ khẩu|(?:^|\s)ở\s)/i;

export function extractRegion(text: string): string | null {
  const trimmed = text.trim();
  const knownBare = extractProvince(trimmed);
  if (
    knownBare &&
    trimmed.length < 60 &&
    !/đi|hay|tỉnh|lái|thử|gia đình|palisade|giá|ưu đãi/.test(
      trimmed.toLowerCase(),
    )
  ) {
    return knownBare;
  }
  if (!LOCATION_CUE.test(text)) return null;
  return extractProvince(text);
}

export function looksLikeInvalidRegion(
  text: string,
  _expectingRegion: boolean,
): boolean {
  if (extractRegion(text)) return false;
  // ponytail: location cue required — bare unknown tokens fall through to LLM re-ask
  return LOCATION_CUE.test(text);
}

export function validationIssues(
  text: string,
  expectingRegion: boolean,
): Array<"phone" | "region"> {
  const issues: Array<"phone" | "region"> = [];
  if (looksLikeInvalidPhone(text)) issues.push("phone");
  if (looksLikeInvalidRegion(text, expectingRegion)) issues.push("region");
  return issues;
}

export function validationReask(
  issues: Array<"phone" | "region">,
): string | null {
  if (issues.includes("phone")) {
    return "Số này chưa đúng định dạng VN (10 số, đầu 03 / 05 / 07 / 08 / 09). Bạn gửi lại giúp mình nhé?";
  }
  if (issues.includes("region")) {
    return "Mình chưa nhận ra khu vực này. Cho mình tỉnh/thành được không — vd. Hà Nội, TP.HCM, Đà Nẵng, Bình Dương?";
  }
  return null;
}

export function extractLeadProfile(userTexts: string[]): LeadProfile {
  let name: string | null = null;
  let region: string | null = null;
  let finance: string | null = null;
  let phone: string | null = null;
  for (const text of userTexts) {
    name = extractName(text) ?? name;
    region = extractRegion(text) ?? region;
    finance = extractFinance(text) ?? finance;
    phone = extractVnPhone(text) ?? phone;
  }
  return { name, region, finance, phone };
}

export function missingLeadFields(profile: LeadProfile): LeadField[] {
  const missing: LeadField[] = [];
  if (!profile.name) missing.push("name");
  if (!profile.region) missing.push("region");
  if (!profile.finance) missing.push("finance");
  if (!profile.phone) missing.push("phone");
  return missing;
}

export function isProfileComplete(profile: LeadProfile): boolean {
  return missingLeadFields(profile).length === 0;
}

export function leadSummary(profile: LeadProfile): string {
  return [
    "Lead Palisade",
    profile.name,
    profile.region,
    profile.finance,
    profile.phone,
  ]
    .filter(Boolean)
    .join(" · ");
}
