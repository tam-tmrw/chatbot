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
  { key: "hcm", label: "TP. Hồ Chí Minh" },
  { key: "sai gon", label: "TP. Hồ Chí Minh" },
  { key: "ba ria vung tau", label: "Bà Rịa - Vũng Tàu" },
];

const PROVINCES: Array<{ key: string; label: string }> = [
  ...REGION_ALIASES,
  ...REGION_LABELS.map((label) => ({ key: foldVn(label), label })),
].sort((a, b) => b.key.length - a.key.length);

export function extractProvince(text: string): string | null {
  const t = foldVn(text);
  for (const p of PROVINCES) {
    if (t.includes(p.key)) return p.label;
  }
  return null;
}
