import { describe, expect, it } from "vitest";
import { markdownToSafeHtml } from "@/lib/chat/markdown";

describe("markdownToSafeHtml", () => {
  it("renders italic asterisks as em", () => {
    expect(markdownToSafeHtml("*Xin chào*")).toBe("<p><em>Xin chào</em></p>");
  });

  it("renders bold and lists", () => {
    const html = markdownToSafeHtml(
      "**Palisade Prestige**\n\n- 7 chỗ\n- điều hòa 3 vùng",
    );
    expect(html).toContain("<strong>Palisade Prestige</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>7 chỗ</li>");
    expect(html).toContain("<li>điều hòa 3 vùng</li>");
  });

  it("escapes raw HTML", () => {
    expect(markdownToSafeHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });
});
