import { describe, expect, it } from "vitest";
import {
  detectNeedGroup,
  extractProvince,
  nextStage,
  quickRepliesFor,
} from "@/lib/conversation/flow";

describe("detectNeedGroup", () => {
  it("classifies the three core buckets plus testdrive", () => {
    expect(detectNeedGroup("Gia đình / SUV 7 chỗ")).toBe("fit");
    expect(detectNeedGroup("Giá & ưu đãi tham khảo")).toBe("price");
    expect(detectNeedGroup("Trả góp / tài chính")).toBe("finance");
    expect(detectNeedGroup("Đăng ký lái thử")).toBe("testdrive");
  });
});

describe("nextStage", () => {
  it("moves fit → qualify then lifestyle → recommend", () => {
    expect(
      nextStage({
        prevStage: "discover",
        userText: "Gia đình / SUV 7 chỗ",
        profileComplete: false,
        hasPhone: false,
      }),
    ).toBe("qualify");
    expect(
      nextStage({
        prevStage: "qualify",
        userText: "Nhà 5 người hay đi Đà Lạt",
        profileComplete: false,
        hasPhone: false,
      }),
    ).toBe("recommend");
  });

  it("price/finance go to recommend; testdrive → capture; complete → confirmed", () => {
    expect(
      nextStage({
        prevStage: "discover",
        userText: "Xem giá lăn bánh",
        profileComplete: false,
        hasPhone: false,
      }),
    ).toBe("recommend");
    expect(
      nextStage({
        prevStage: "recommend",
        userText: "Đăng ký lái thử",
        profileComplete: false,
        hasPhone: false,
      }),
    ).toBe("capture_phone");
    expect(
      nextStage({
        prevStage: "capture_phone",
        userText: "0901234567",
        profileComplete: false,
        hasPhone: true,
      }),
    ).toBe("capture_phone");
    expect(
      nextStage({
        prevStage: "capture_phone",
        userText: "0901234567",
        profileComplete: true,
        hasPhone: true,
      }),
    ).toBe("confirmed");
  });
});

describe("quickRepliesFor + extractProvince", () => {
  it("returns discover chips matching welcome", () => {
    expect(quickRepliesFor("discover", null)).toContain("Đăng ký lái thử");
  });

  it("asks capture chips by next missing lead field", () => {
    expect(quickRepliesFor("capture_phone", null, ["name"])).toEqual([]);
    expect(quickRepliesFor("capture_phone", null, ["region"])).toContain(
      "Hà Nội",
    );
    expect(quickRepliesFor("capture_phone", null, ["finance"])).toContain(
      "Trả góp",
    );
    expect(quickRepliesFor("capture_phone", null, ["phone"])).toContain(
      "Để lại SĐT sau",
    );
  });

  it("extracts VN city chips", () => {
    expect(extractProvince("TP. Hồ Chí Minh")).toBe("TP. Hồ Chí Minh");
    expect(extractProvince("Mình ở Hà Nội")).toBe("Hà Nội");
    expect(extractProvince("binh duong")).toBe("Bình Dương");
    expect(extractProvince("Đà Lạt")).toBe("Đà Lạt");
    expect(extractProvince("Palisade 7 chỗ")).toBeNull();
  });
});
