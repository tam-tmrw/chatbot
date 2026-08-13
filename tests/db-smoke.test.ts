import { describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("mysql smoke", () => {
  it("connects and selects 1", async () => {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection(process.env.DATABASE_URL!);
    const [rows] = await conn.query("SELECT 1 AS n");
    await conn.end();
    expect((rows as Array<{ n: number }>)[0].n).toBe(1);
  });
});
