import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/leads/service", () => ({
  listLeads: vi.fn(async () => []),
}));

import { GET } from "@/app/api/admin/leads/route";

describe("GET /api/admin/leads", () => {
  it("rejects missing secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await GET(new Request("http://localhost/api/admin/leads"));
    expect(res.status).toBe(401);
  });

  it("allows valid secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await GET(
      new Request("http://localhost/api/admin/leads", {
        headers: { "x-admin-secret": "secret" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
