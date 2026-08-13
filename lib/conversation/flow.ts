export type FlowStage =
  | "discover"
  | "qualify"
  | "recommend"
  | "capture_phone"
  | "confirmed";

export type NeedGroup = "fit" | "price" | "finance" | "testdrive";

export const WELCOME_TEXT = `YASSSS xin chào 🚨
Mình là **MAI** — đang mê Hyundai Palisade. Không phải tổng đài Hyundai nha: mình kể xe theo đời sống, rồi book **lái thử** giúp.

Bạn đang muốn MAI hỗ trợ kiểu nào?`;

export const WELCOME_REPLIES = [
  "Gia đình / SUV 7 chỗ",
  "Giá & ưu đãi tham khảo",
  "Trả góp / tài chính",
  "Đăng ký lái thử",
];

function foldVn(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

// ponytail: static VN places (63 tỉnh + thành phố hay dùng). Upgrade: API hành chính if list drifts.
const REGION_LABELS = [
  "TP. Hồ Chí Minh",
  "Hà Nội",
  "Hải Phòng",
  "Đà Nẵng",
  "Cần Thơ",
  "Huế",
  "Thừa Thiên Huế",
  "An Giang",
  "Bà Rịa - Vũng Tàu",
  "Vũng Tàu",
  "Bắc Giang",
  "Bắc Kạn",
  "Bạc Liêu",
  "Bắc Ninh",
  "Bến Tre",
  "Bình Định",
  "Bình Dương",
  "Bình Phước",
  "Bình Thuận",
  "Cà Mau",
  "Cao Bằng",
  "Đắk Lắk",
  "Đắk Nông",
  "Điện Biên",
  "Đồng Nai",
  "Đồng Tháp",
  "Gia Lai",
  "Hà Giang",
  "Hà Nam",
  "Hà Tĩnh",
  "Hải Dương",
  "Hậu Giang",
  "Hòa Bình",
  "Hưng Yên",
  "Khánh Hòa",
  "Nha Trang",
  "Kiên Giang",
  "Kon Tum",
  "Lai Châu",
  "Lâm Đồng",
  "Đà Lạt",
  "Lạng Sơn",
  "Lào Cai",
  "Long An",
  "Nam Định",
  "Nghệ An",
  "Ninh Bình",
  "Ninh Thuận",
  "Phú Thọ",
  "Phú Yên",
  "Quảng Bình",
  "Quảng Nam",
  "Quảng Ngãi",
  "Quảng Ninh",
  "Quảng Trị",
  "Sóc Trăng",
  "Sơn La",
  "Tây Ninh",
  "Thái Bình",
  "Thái Nguyên",
  "Thanh Hóa",
  "Tiền Giang",
  "Trà Vinh",
  "Tuyên Quang",
  "Vĩnh Long",
  "Vĩnh Phúc",
  "Yên Bái",
  "Biên Hòa",
  "Thủ Đức",
  "Quy Nhơn",
  "Phan Thiết",
  "Buôn Ma Thuột",
  "Mỹ Tho",
  "Hạ Long",
];

const REGION_ALIASES: Array<{ key: string; label: string }> = [
  { key: "thanh pho ho chi minh", label: "TP. Hồ Chí Minh" },
  { key: "tp ho chi minh", label: "TP. Hồ Chí Minh" },
  { key: "ho chi minh", label: "TP. Hồ Chí Minh" },
  { key: "tp.hcm", label: "TP. Hồ Chí Minh" },
  { key: "tphcm", label: "TP. Hồ Chí Minh" },
  { key: "sai gon", label: "TP. Hồ Chí Minh" },
  { key: "ba ria vung tau", label: "Bà Rịa - Vũng Tàu" },
];

const PROVINCES: Array<{ key: string; label: string }> = [
  ...REGION_ALIASES,
  ...REGION_LABELS.map((label) => ({ key: foldVn(label), label })),
].sort((a, b) => b.key.length - a.key.length);

export function detectNeedGroup(text: string): NeedGroup | null {
  const t = text.toLowerCase();
  if (/lái thử|xem xe|đặt lịch|test drive|đăng ký lái/.test(t)) {
    return "testdrive";
  }
  if (/trả góp|lãi|vay|ngân hàng|đặt cọc|trả trước|tài chính/.test(t)) {
    return "finance";
  }
  if (/giá|lăn bánh|khuyến mãi|ưu đãi|thuế|bảng giá|bao nhiêu/.test(t)) {
    return "price";
  }
  if (
    /gia đình|suv|7 chỗ|sedan|đà lạt|đi làm|dịch vụ|roadtrip|cá nhân|gầm cao|5 người|6–7|6-7/.test(
      t,
    )
  ) {
    return "fit";
  }
  return null;
}

export function extractProvince(text: string): string | null {
  const t = foldVn(text);
  for (const p of PROVINCES) {
    if (t.includes(p.key)) return p.label;
  }
  return null;
}

export function parseFlowStage(raw: string | null | undefined): FlowStage | null {
  if (
    raw === "discover" ||
    raw === "qualify" ||
    raw === "recommend" ||
    raw === "capture_phone" ||
    raw === "confirmed"
  ) {
    return raw;
  }
  return null;
}

export function nextStage(args: {
  prevStage: FlowStage | null;
  userText: string;
  profileComplete: boolean;
  hasPhone: boolean;
}): FlowStage {
  if (args.profileComplete) return "confirmed";

  const group = detectNeedGroup(args.userText);
  const prev = args.prevStage ?? "discover";
  const t = args.userText.toLowerCase();
  const hasLifestyle =
    /[1-9]\s*người|đà lạt|đi tỉnh|đi phố|đi làm|roadtrip|6–7|6-7/.test(t);

  if (
    args.hasPhone ||
    group === "testdrive" ||
    prev === "capture_phone"
  ) {
    return "capture_phone";
  }
  if (group === "price" || group === "finance") return "recommend";
  if (hasLifestyle || prev === "qualify") return "recommend";
  if (group === "fit") return "qualify";
  if (prev === "recommend" && /(muốn|ok|hay|được|ừ|uh)/.test(t)) {
    return "capture_phone";
  }
  if (prev === "discover") return "qualify";
  return prev;
}

export function quickRepliesFor(
  stage: FlowStage,
  needGroup: NeedGroup | null,
  missing?: Array<"name" | "region" | "finance" | "phone">,
): string[] {
  switch (stage) {
    case "discover":
      return [...WELCOME_REPLIES];
    case "qualify":
      return [
        "Gia đình 5 người",
        "Gia đình 6–7 người",
        "Hay đi tỉnh / Đà Lạt",
        "Đi phố / đi làm",
      ];
    case "recommend":
      if (needGroup === "finance") {
        return [
          "Để lại SĐT nhận phương án",
          "Xem giá niêm yết",
          "Đăng ký lái thử",
        ];
      }
      return [
        "Xem giá các bản Palisade",
        "Đăng ký lái thử",
        "So sánh Exclusive / Prestige",
      ];
    case "capture_phone": {
      const next = missing?.[0];
      if (next === "name") return [];
      if (next === "region") {
        return ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"];
      }
      if (next === "finance") {
        return ["Tiền mặt", "Trả góp", "Ngân sách ~1.5 tỷ"];
      }
      if (next === "phone") return ["Để lại SĐT sau"];
      return ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"];
    }
    case "confirmed":
      return ["Hỏi thêm về Palisade", "Đổi lịch lái thử"];
  }
}
