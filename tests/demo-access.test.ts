import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/demo-access/route";
import { codeMatches, hasDemoCookie } from "@/lib/demo-access";

describe("demo access", () => {
  it("accepts only the 6-character env code", () => {
    process.env.HUGGIES_ACCESS_CODE = "ab12cd";
    expect(codeMatches("huggies", "ab12cd")).toBe(true);
    expect(codeMatches("huggies", "AB12CD")).toBe(false);
    expect(codeMatches("huggies", "short")).toBe(false);
    process.env.HYUNDAI_ACCESS_CODE = "12345";
    expect(codeMatches("hyundai", "12345")).toBe(false);
  });

  it("sets a session cookie and rejects a bad code", async () => {
    process.env.HUGGIES_ACCESS_CODE = "ab12cd";
    const bad = await POST(
      new Request("http://localhost/api/demo-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demo: "huggies", code: "zzzzzz" }),
      }),
    );
    expect(bad.status).toBe(401);

    const ok = await POST(
      new Request("http://localhost/api/demo-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demo: "huggies", code: "ab12cd" }),
      }),
    );
    expect(ok.status).toBe(204);
    const setCookie = ok.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vi_demo_huggies=1");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).not.toContain("max-age");

    const gated = new Request("http://localhost/api/huggies/session", {
      headers: { cookie: "vi_demo_huggies=1" },
    });
    expect(hasDemoCookie(gated, "huggies")).toBe(true);
    expect(hasDemoCookie(gated, "hyundai")).toBe(false);
  });
});
