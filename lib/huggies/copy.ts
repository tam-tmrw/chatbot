import type { Button, QcReason, Session } from "@/lib/huggies/types";
import { HOBBIES } from "@/lib/huggies/validate";

const QC_COPY: Record<QcReason, string> = {
  no_face: "Không thấy rõ mặt bé",
  multi_face: "Có nhiều hơn 1 khuôn mặt",
  other_person: "Có người khác trong ảnh",
  blurry: "Ảnh hơi mờ",
  too_dark: "Ảnh thiếu sáng",
  covered: "Mặt bị che",
  low_res: "Ảnh độ phân giải thấp",
  not_frontal: "Mặt chưa nhìn thẳng",
  bad_type: "Ba mẹ gửi ảnh JPG hoặc PNG giúp mình nhé.",
  too_large: "Ảnh nặng quá 5MB. Ba mẹ gửi ảnh nhỏ hơn giúp mình nhé.",
};

export function qcUserCopy(reason: QcReason): string {
  return QC_COPY[reason];
}

const GENDER_LABEL = { boy: "Bé trai", girl: "Bé gái", unspecified: "Không nêu" };
const AGE_LABEL = { "<1": "Dưới 1 tuổi", "1-2": "1–2 tuổi", "2-3": "2–3 tuổi", ">3": "Trên 3 tuổi" };

export function promptFor(session: Session): { text: string; buttons: Button[] } {
  const f = session.fields;
  switch (session.step) {
    case "welcome":
      return {
        text: "Xin chào ba mẹ! Mình là trợ lý Huggies. Cùng tạo video nhảy đáng yêu cho bé chỉ trong vài phút nhé.",
        buttons: [{ id: "start", label: "Bắt đầu" }],
      };
    case "consent":
      return {
        text: "Trước khi bắt đầu, ba mẹ vui lòng đồng ý Điều khoản. 1. Đồng ý 2. Xem điều khoản 3. Không đồng ý",
        buttons: [
          { id: "yes", label: "Đồng ý" },
          { id: "terms", label: "Xem điều khoản" },
          { id: "no", label: "Không đồng ý" },
        ],
      };
    case "baby_name":
      return { text: "Bé nhà mình tên gì ạ?", buttons: [] };
    case "display_name":
      return {
        text: `Tên hiện trên video tối đa 12 ký tự. Ba mẹ muốn giữ ${f.babyName ?? ""} hay đặt biệt danh ngắn hơn?`,
        buttons:
          f.babyName && f.babyName.length <= 12
            ? [{ id: "keep", label: "Giữ tên này" }]
            : [],
      };
    case "gender":
      return {
        text: "Bé là:\n1. Bé trai\n2. Bé gái\n3. Không nêu / Khác\n\nMình không đoán giới tính từ ảnh nhé.",
        buttons: [
          { id: "boy", label: "Bé trai" },
          { id: "girl", label: "Bé gái" },
          { id: "unspecified", label: "Không nêu" },
        ],
      };
    case "age_range":
      return {
        text: "Bé đang ở độ tuổi nào ạ?\n1. Dưới 1 tuổi\n2. 1–2 tuổi\n3. 2–3 tuổi\n4. Trên 3 tuổi",
        buttons: [
          { id: "age_1", label: "Dưới 1 tuổi" },
          { id: "age_2", label: "1–2 tuổi" },
          { id: "age_3", label: "2–3 tuổi" },
          { id: "age_4", label: "Trên 3 tuổi" },
        ],
      };
    case "hobby":
      return {
        text: HOBBIES.map((h, i) => `${i + 1}. ${h.label}`).join("\n"),
        buttons: HOBBIES.map((h) => ({ id: h.id, label: h.label })),
      };
    case "photo":
      return {
        text: "Gửi 1 ảnh mặt bé rõ, nhìn thẳng, đủ sáng. Ảnh chỉ dùng tạo video.",
        buttons: [],
      };
    case "confirm":
      if (session.editMenu) {
        return {
          text: "Ba mẹ muốn sửa phần nào?",
          buttons: [
            { id: "edit_name", label: "Tên" },
            { id: "edit_display", label: "Tên trên video" },
            { id: "edit_gender", label: "Giới tính" },
            { id: "edit_age", label: "Tuổi" },
            { id: "edit_hobby", label: "Sở thích" },
          ],
        };
      }
      return {
        text: [
          "Mình tóm tắt nhé:",
          `Tên: ${f.babyName ?? ""}`,
          `Tên trên video: ${f.displayName ?? ""}`,
          `Giới tính: ${f.gender ? GENDER_LABEL[f.gender] : ""}`,
          `Độ tuổi: ${f.ageRange ? AGE_LABEL[f.ageRange] : ""}`,
          `Sở thích: ${HOBBIES.find((h) => h.id === f.hobby)?.label ?? ""}`,
          "Ảnh: đã nhận",
          "1. Xác nhận tạo video",
          "2. Sửa thông tin",
          "3. Đổi ảnh",
        ].join("\n"),
        buttons: [
          { id: "confirm", label: "Xác nhận tạo video" },
          { id: "edit", label: "Sửa thông tin" },
          { id: "edit_photo", label: "Đổi ảnh" },
        ],
      };
    case "processing":
      return {
        text: `Đang tạo video cho bé ${f.displayName ?? ""}… Ba mẹ chờ mình một chút nhé!`,
        buttons: [],
      };
    case "result":
      return {
        text: `Xong rồi! Video của bé ${f.displayName ?? ""} đây ạ.`,
        buttons: [
          { id: "share", label: "Chia sẻ" },
          { id: "replay", label: "Làm lại" },
          { id: "learn", label: "Tìm hiểu sản phẩm Huggies" },
        ],
      };
    case "error":
      return {
        text: `Xin lỗi ba mẹ, lần này mình chưa tạo được video (${session.job?.errorCode ?? "error"}).`,
        buttons: [],
      };
    case "cs":
      return { text: "Mình chuyển ba mẹ sang tư vấn viên nhé.", buttons: [] };
    case "end":
      return { text: "Cảm ơn ba mẹ. Mình dừng tại đây nhé.", buttons: [] };
  }
}
