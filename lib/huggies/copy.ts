import type { Button, DemoChannel, QcReason, Session } from "@/lib/huggies/types";
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
  too_large: "Ảnh hơi nặng (>5MB). Ba mẹ chọn ảnh nhẹ hơn giúp mình nhé.",
};

export function qcUserCopy(reason: QcReason): string {
  return QC_COPY[reason];
}

const GENDER_LABEL = { boy: "Bé trai", girl: "Bé gái", unspecified: "Không nêu" };
const AGE_LABEL = { "<1": "Dưới 1 tuổi", "1-2": "1–2 tuổi", "2-3": "2–3 tuổi", ">3": "Trên 3 tuổi" };

const HOBBY_ICON: Record<string, string> = {
  cars: "🚗",
  animals: "🐾",
  music: "🎵",
  dance: "💃",
  sports: "⚽",
  princess: "👑",
  space: "🚀",
  art: "🎨",
  toys: "🧸",
  nature: "🌿",
};

function withIcon(icon: string, label: string): string {
  return `${icon} ${label}`;
}

function numbered(lead: string, options: string[]): string {
  return [lead, ...options.map((o, i) => `${i + 1}. ${o}`)].join("\n");
}

function surface(
  channel: DemoChannel,
  lead: string,
  options: Button[],
): { text: string; buttons: Button[] } {
  if (channel === "zalo") {
    return {
      text: [lead, "", "Ba mẹ gõ số tương ứng giúp mình nhé:", ...options.map((o, i) => `${i + 1}. ${o.label}`)].join(
        "\n",
      ),
      buttons: [],
    };
  }
  return { text: lead, buttons: options };
}

export function errorButtons(channel: DemoChannel, canRetry: boolean): Button[] {
  const buttons: Button[] = [];
  if (canRetry) buttons.push({ id: "retry", label: withIcon("🔄", "Thử lại") });
  buttons.push({ id: "cs", label: withIcon("💬", "Gặp tư vấn viên") });
  buttons.push({ id: "end", label: withIcon("👋", "Kết thúc") });
  if (channel === "zalo") return [];
  return buttons;
}

export function errorPromptText(canRetry: boolean): string {
  const opts = canRetry
    ? ["🔄 Thử lại", "💬 Gặp tư vấn viên", "👋 Kết thúc"]
    : ["💬 Gặp tư vấn viên", "👋 Kết thúc"];
  return numbered("Ba mẹ chọn giúp mình nhé:", opts);
}

/** Short ack so the flow feels like a chat, not a form submit. */
export function ackFor(
  prev: Session["step"],
  session: Session,
): string | null {
  const f = session.fields;
  switch (prev) {
    case "baby_name":
      return f.babyName ? `Ok mình ghi nhận bé ${f.babyName} nhé!` : null;
    case "display_name":
      return f.displayName
        ? `Ok mình để “${f.displayName}” trên video nhé!`
        : null;
    case "gender":
      return "Ok mình đã ghi giới tính rồi ạ.";
    case "age_range":
      return "Ok mình đã ghi độ tuổi rồi ạ.";
    case "hobby":
      return "Ok mình chọn kiểu video theo sở thích này nhé!";
    default:
      return null;
  }
}

/** Soft re-ask when the last answer wasn’t usable. */
export function gentleHint(step: Session["step"]): string {
  switch (step) {
    case "baby_name":
      return "Mình chưa rõ tên bé ạ. Ba mẹ gõ tên thường gọi giúp mình nhé — ví dụ: Bin hoặc Minh Anh.";
    case "display_name":
      return "Tên trên video cần ngắn (tối đa 12 ký tự, không dấu cách). Ví dụ: Bin, MinhAnh, CuDat.";
    case "gender":
      return "Ba mẹ chọn giúp mình số tương ứng với giới tính bé nhé.";
    case "age_range":
      return "Ba mẹ chọn giúp mình độ tuổi gần đúng của bé nhé.";
    case "hobby":
      return "Ba mẹ chọn 1 sở thích trong danh sách giúp mình nhé.";
    case "confirm":
      return "Ba mẹ gõ 1 để tạo video, 2 để sửa thông tin, hoặc 3 để đổi ảnh nhé.";
    default:
      return "Ba mẹ trả lời giúp mình một chút nữa nhé.";
  }
}

export function promptFor(session: Session): { text: string; buttons: Button[] } {
  const f = session.fields;
  const ch: DemoChannel = session.channel ?? "zalo";
  switch (session.step) {
    case "welcome":
      if (session.mode === "guide") {
        return {
          text: [
            "👋 Xin chào ba mẹ! Mình là trợ lý Huggies cho chiến dịch tạo video nhảy đáng yêu cho bé.",
            "📝 Ba mẹ chỉ cần trả lời tự nhiên vài câu (tên bé, giới tính, độ tuổi, sở thích), đồng ý điều khoản dùng ảnh, rồi gửi 1 ảnh mặt bé rõ — mình sẽ ghép thành video ngắn.",
            "✨ Nhắn “bắt đầu” (hoặc “ok”) để xem điều khoản và bắt đầu nhé.",
          ].join("\n"),
          buttons: [],
        };
      }
      return surface(
        ch,
        "Xin chào ba mẹ! Mình là trợ lý Huggies — mình sẽ hỏi vài thông tin ngắn rồi cùng tạo video nhảy đáng yêu cho bé nhé.",
        [{ id: "start", label: withIcon("✨", "Bắt đầu") }],
      );
    case "consent":
      return surface(
        ch,
        "Trước khi bắt đầu, mình cần ba mẹ đồng ý Điều khoản sử dụng ảnh để tạo video. Ba mẹ chọn giúp mình nhé.",
        [
          { id: "yes", label: withIcon("✅", "Đồng ý") },
          { id: "terms", label: withIcon("📄", "Xem điều khoản") },
          { id: "no", label: withIcon("❌", "Không đồng ý") },
        ],
      );
    case "baby_name":
      return {
        text: "Bé nhà mình tên gì ạ?\nBa mẹ gõ tên thường gọi giúp mình nhé — ví dụ: Bin, Bé Na, Minh Anh.",
        buttons: [],
      };
    case "display_name": {
      const lead = [
        `Tên hiện trên video tối đa 12 ký tự và viết liền (không dấu cách).`,
        f.babyName
          ? `Hiện mình đang có “${f.babyName}”. Ba mẹ muốn giữ tên này hay đặt biệt danh ngắn hơn?`
          : "Ba mẹ muốn hiện tên gì trên video?",
        f.babyName && f.babyName.length <= 12 && !/\s/.test(f.babyName)
          ? `Gợi ý: giữ nguyên, hoặc thử ${f.babyName.replace(/\s+/g, "").slice(0, 12)}.`
          : f.babyName
            ? `Gợi ý viết liền: ${(f.babyName.replace(/\s+/g, "") || "Bin").slice(0, 12)}.`
            : "Ví dụ: Bin, MinhAnh, CuDat.",
      ].join("\n");
      const squeezed = (f.babyName ?? "").replace(/\s+/g, "").slice(0, 12);
      const keep =
        squeezed.length >= 2
          ? [{ id: "keep", label: withIcon("👍", `Giữ “${squeezed}”`) }]
          : [];
      if (!keep.length) return { text: lead, buttons: [] };
      return surface(ch, lead, keep);
    }
    case "gender":
      return surface(ch, "Bé là bé trai hay bé gái ạ? (Mình không đoán từ ảnh đâu nhé.)", [
        { id: "boy", label: withIcon("👦", "Bé trai") },
        { id: "girl", label: withIcon("👧", "Bé gái") },
        { id: "unspecified", label: withIcon("❔", "Không nêu") },
      ]);
    case "age_range":
      return surface(ch, "Bé đang ở độ tuổi nào ạ? Chọn mức gần đúng giúp mình nhé.", [
        { id: "age_1", label: withIcon("👶", "Dưới 1 tuổi") },
        { id: "age_2", label: withIcon("🍼", "1–2 tuổi") },
        { id: "age_3", label: withIcon("🧒", "2–3 tuổi") },
        { id: "age_4", label: withIcon("🌟", "Trên 3 tuổi") },
      ]);
    case "hobby":
      return surface(ch, "Bé thích gì nhất? Chọn 1 sở thích để mình chọn kiểu video cho hợp nhé.", [
        ...HOBBIES.map((h) => ({
          id: h.id,
          label: withIcon(HOBBY_ICON[h.id] ?? "⭐", h.label),
        })),
      ]);
    case "photo":
      return {
        text:
          ch === "zalo"
            ? "Gửi giúp mình 1 ảnh mặt bé rõ, nhìn thẳng, đủ sáng nhé. Ảnh chỉ dùng để tạo video."
            : "Gửi giúp mình 1 ảnh mặt bé rõ, nhìn thẳng, đủ sáng nhé. Ba mẹ chọn ảnh bên dưới hoặc bấm nút camera. Ảnh chỉ dùng để tạo video.",
        buttons: [],
      };
    case "confirm":
      if (session.editMenu) {
        return surface(ch, "Ba mẹ muốn sửa phần nào? Chọn giúp mình nhé.", [
          { id: "edit_name", label: withIcon("✏️", "Tên") },
          { id: "edit_display", label: withIcon("🏷️", "Tên trên video") },
          { id: "edit_gender", label: withIcon("👶", "Giới tính") },
          { id: "edit_age", label: withIcon("📅", "Tuổi") },
          { id: "edit_hobby", label: withIcon("💫", "Sở thích") },
        ]);
      }
      return surface(
        ch,
        [
          "Mình tóm tắt lại cho ba mẹ kiểm tra nhé:",
          `Tên: ${f.babyName ?? ""}`,
          `Tên trên video: ${f.displayName ?? ""}`,
          `Giới tính: ${f.gender ? GENDER_LABEL[f.gender] : ""}`,
          `Độ tuổi: ${f.ageRange ? AGE_LABEL[f.ageRange] : ""}`,
          `Sở thích: ${HOBBIES.find((h) => h.id === f.hobby)?.label ?? ""}`,
          "Ảnh: đã nhận",
          "",
          "Ổn rồi thì xác nhận giúp mình; cần chỉnh thì chọn sửa nhé.",
        ].join("\n"),
        [
          { id: "confirm", label: withIcon("✅", "Xác nhận tạo video") },
          { id: "edit", label: withIcon("✏️", "Sửa thông tin") },
          { id: "edit_photo", label: withIcon("📷", "Đổi ảnh") },
        ],
      );
    case "processing":
      return {
        text: `⏳ Đang tạo video cho bé ${f.displayName ?? ""}… Ba mẹ chờ mình một chút nhé!`,
        buttons: [],
      };
    case "result":
      return surface(
        ch,
        `🎉 Xong rồi ạ! Video của bé ${f.displayName ?? ""} đây. Ba mẹ bấm link bên dưới để xem, rồi chọn bước tiếp theo nhé.`,
        [
          { id: "share", label: withIcon("📤", "Chia sẻ") },
          { id: "replay", label: withIcon("🔄", "Làm lại") },
          { id: "learn", label: withIcon("💙", "Tìm hiểu sản phẩm Huggies") },
        ],
      );
    case "error": {
      const canRetry =
        session.job?.errorCode === "render_fail" && (session.job.retries ?? 0) < 2;
      const lead =
        "Xin lỗi ba mẹ, lần này mình chưa tạo được video. Ba mẹ thử lại hoặc nhờ tư vấn viên hỗ trợ giúp mình nhé.";
      if (ch === "zalo") {
        return {
          text: `${lead}\n${errorPromptText(canRetry)}`,
          buttons: [],
        };
      }
      return { text: lead, buttons: errorButtons(ch, canRetry) };
    }
    case "cs":
      return {
        text: "Mình chuyển ba mẹ sang tư vấn viên để được hỗ trợ kỹ hơn nhé.",
        buttons: [],
      };
    case "end":
      return {
        text: "Cảm ơn ba mẹ đã ghé chơi. Khi nào muốn tạo video cho bé, nhắn mình lại nhé.",
        buttons: [],
      };
  }
}
