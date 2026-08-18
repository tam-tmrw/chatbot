import { describe, expect, it } from "vitest";
import { extractProvince } from "@/lib/conversation/flow";

describe("extractProvince", () => {
  it("extracts VN city names", () => {
    expect(extractProvince("TP. Hồ Chí Minh")).toBe("TP. Hồ Chí Minh");
    expect(extractProvince("Mình ở Hà Nội")).toBe("Hà Nội");
    expect(extractProvince("binh duong")).toBe("Bình Dương");
    expect(extractProvince("Palisade 7 chỗ")).toBeNull();
  });
});
