import { timingSafeEqual } from "node:crypto";

export type DemoId = "hyundai" | "huggies";

const ENV: Record<DemoId, string> = {
  hyundai: "HYUNDAI_ACCESS_CODE",
  huggies: "HUGGIES_ACCESS_CODE",
};

const NAMES: Record<DemoId, string> = {
  hyundai: "vi_demo_hyundai",
  huggies: "vi_demo_huggies",
};

export function cookieName(demo: DemoId): string {
  return NAMES[demo];
}

export function codeMatches(demo: DemoId, given: string): boolean {
  const expected = process.env[ENV[demo]] ?? "";
  if (expected.length !== 6 || given.length !== 6) return false;
  if (Buffer.byteLength(expected) !== Buffer.byteLength(given)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export function hasDemoCookie(req: Request, demo: DemoId): boolean {
  const name = cookieName(demo);
  const raw = req.headers.get("cookie") ?? "";
  return raw.split(";").some((part) => part.trim() === `${name}=1`);
}

export function demoCookieHeader(demo: DemoId): string {
  return `${cookieName(demo)}=1; Path=/; HttpOnly; SameSite=Lax`;
}
