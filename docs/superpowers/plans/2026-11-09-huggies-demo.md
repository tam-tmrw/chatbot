# Huggies Pitch Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/huggies` pitch chat that collects baby-video fields, checks a photo with Rekognition, and returns one stable S3 video URL, while the Hyundai demo stays on its current engine and both demos ask for a 6-character access code.

**Architecture:** A separate `lib/huggies` state machine owns steps, enums, jobs, and QC decisions. Sessions live in a process `Map`. The Next.js route calls Rekognition and the existing LLM client, then passes results in. Hyundai `handleTurn` is unchanged; `/`, `/c/[sessionId]`, and the web chat APIs only gain a cookie check.

**Tech Stack:** Next.js 15 App Router, React 19, Vitest, existing `LlmProvider` (`lib/llm`), `@aws-sdk/client-rekognition`.

## Global Constraints

- Design source: `docs/huggies-demo-design.md`. Do not implement out-of-scope items from section 6 of that doc (no `timeout` / `error_system` scenarios, no global restart/help/off-topic, no baby-label or age/gender inference, no photo storage, no Zalo, no CS tickets, no MySQL table for Huggies).
- Access codes are exactly 6 characters: `HYUNDAI_ACCESS_CODE`, `HUGGIES_ACCESS_CODE`.
- Cookie names: `vi_demo_hyundai`, `vi_demo_huggies`. Value `1`. `HttpOnly`; `SameSite=Lax`; `Path=/`; no `Max-Age` (session cookie). Do not set `Secure` (localhost pitch).
- ManyChat (`/api/manychat/callback`) and admin (`ADMIN_SECRET`) stay on their current secrets. Do not require a demo cookie there.
- LLM timeout for Huggies extract: `2000` ms. Job wait: `3000` ms (`HUGGIES_DELAY_MS` overrides in tests).
- Photo max `5000000` bytes. JPG/PNG only.
- QC pass: exactly 1 face, confidence `>= 90`, brightness `>= 40`, sharpness `>= 40`, abs(yaw) and abs(pitch) `<= 25`, not occluded, min edge `>= 400`, person count `<= 1`. No Baby label. No age check.
- `error_photo_invalid` still calls Rekognition. Real failure uses the real reason. A passing photo is forced to fail with rotating reasons `no_face`, `blurry`, `too_dark`, `covered`, `low_res`, `multi_face`.
- AWS/Rekognition throw: ask to resend, do not increment `photoFails`, drop bytes.
- `photoFails` max `3`, then CS copy and no job.
- One `jobId` per session. Render retry max `2` after the first failure. Empty `HUGGIES_VIDEO_URLS` yields a demo error and no URL.
- Terms version default `huggies-video-2026-11`.
- Successful extract jumps to the first missing field. The next message is that step's hardcoded prompt. A thrown/invalid extract leaves the step unchanged and uses fallback copy. `ai=off` never calls the LLM.
- Changing scenario or AI on the page creates a new session.

---

## File structure

- `lib/demo-access.ts` — code check and cookie helpers.
- `app/api/demo-access/route.ts` — set the cookie after a match.
- `app/components/DemoGate.tsx` — code form for both demos.
- `lib/huggies/types.ts` — session and turn types.
- `lib/huggies/copy.ts` — Vietnamese prompts and buttons.
- `lib/huggies/validate.ts` — name and enum parsers.
- `lib/huggies/qc.ts` — `judgeFace` and thresholds.
- `lib/huggies/image.ts` — PNG/JPEG min edge.
- `lib/huggies/machine.ts` — `freshSession`, `applyTurn`, `settle`.
- `lib/huggies/ai.ts` — LLM JSON extract.
- `lib/huggies/rekognition.ts` — AWS response → `FaceFacts`.
- `lib/huggies/store.ts` — in-memory sessions.
- `lib/huggies/env.ts` — video URL list and delay.
- `app/api/huggies/session/route.ts`, `app/api/huggies/message/route.ts`, `app/api/huggies/job/route.ts`.
- `app/huggies/page.tsx`, `app/huggies/HuggiesChat.tsx`.

Hyundai files touched only for the gate: `app/page.tsx`, `app/c/[sessionId]/page.tsx`, `app/api/chat/route.ts`, `app/api/chat/sessions/[sessionId]/messages/route.ts`, `tests/api-chat.test.ts`, `.env.example`, `README.md`. Export `foldVn` from `lib/conversation/flow.ts`.

---

### Task 1: Demo access cookie

**Files:**
- Create: `lib/demo-access.ts`
- Create: `app/api/demo-access/route.ts`
- Create: `tests/demo-access.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: none
- Produces:
  - `export type DemoId = "hyundai" | "huggies"`
  - `export function cookieName(demo: DemoId): string`
  - `export function codeMatches(demo: DemoId, given: string): boolean`
  - `export function hasDemoCookie(req: Request, demo: DemoId): boolean`
  - `export function demoCookieHeader(demo: DemoId): string`
  - `POST` `app/api/demo-access/route.ts` body `{ demo: DemoId, code: string }` → `204` and `Set-Cookie`, or `401`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/demo-access.test.ts`

Expected: FAIL with cannot find module `@/lib/demo-access` or `@/app/api/demo-access/route`

- [ ] **Step 3: Write minimal implementation**

`lib/demo-access.ts`

```ts
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
```

`app/api/demo-access/route.ts`

```ts
import { codeMatches, demoCookieHeader, type DemoId } from "@/lib/demo-access";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const demo = (body as { demo?: string }).demo;
  const code = (body as { code?: string }).code ?? "";
  if (demo !== "hyundai" && demo !== "huggies") {
    return Response.json({ error: "Bad demo" }, { status: 400 });
  }
  if (!codeMatches(demo as DemoId, code)) {
    return Response.json({ error: "Sai mã" }, { status: 401 });
  }
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": demoCookieHeader(demo) },
  });
}
```

Append to `.env.example`:

```text
HYUNDAI_ACCESS_CODE=change
HUGGIES_ACCESS_CODE=change
HUGGIES_VIDEO_URLS=https://example.s3.amazonaws.com/a.mp4,https://example.s3.amazonaws.com/b.mp4
HUGGIES_PREVIEW_URL=
HUGGIES_LEARN_MORE_URL=https://www.huggies.com.vn
HUGGIES_TERMS_URL=#
HUGGIES_TERMS_VERSION=huggies-video-2026-11
HUGGIES_DELAY_MS=3000
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/demo-access.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/demo-access.ts app/api/demo-access/route.ts tests/demo-access.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat: add per-demo six-character access cookies

EOF
)"
```

---

### Task 2: Gate Hyundai pages and web chat APIs

**Files:**
- Create: `app/components/DemoGate.tsx`
- Modify: `app/page.tsx`
- Modify: `app/c/[sessionId]/page.tsx`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/chat/sessions/[sessionId]/messages/route.ts`
- Modify: `tests/api-chat.test.ts`
- Test: `tests/api-chat.test.ts`

**Interfaces:**
- Consumes: `cookieName`, `hasDemoCookie` from Task 1
- Produces: `DemoGate` client component with prop `demo: "hyundai" | "huggies"`. Hyundai chat UI renders only when `vi_demo_hyundai=1`.

- [ ] **Step 1: Write the failing test**

Add this case to `tests/api-chat.test.ts` and add header `cookie: "vi_demo_hyundai=1"` to the three existing `Request`s (empty message, database unavailable, reply payload).

```ts
it("returns 401 without the hyundai demo cookie", async () => {
  const req = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi", channelUserId: "u1" }),
  });
  const res = await POST(req);
  expect(res.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-chat.test.ts`

Expected: FAIL — the new case returns 200 or 400, not 401

- [ ] **Step 3: Write minimal implementation**

At the top of `POST` in `app/api/chat/route.ts`, before JSON parse:

```ts
import { hasDemoCookie } from "@/lib/demo-access";

export async function POST(req: Request) {
  if (!hasDemoCookie(req, "hyundai")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // existing body unchanged
}
```

At the top of `GET` in `app/api/chat/sessions/[sessionId]/messages/route.ts`, before `sessionExists`:

```ts
import { hasDemoCookie } from "@/lib/demo-access";

if (!hasDemoCookie(req, "hyundai")) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

`app/components/DemoGate.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DemoId } from "@/lib/demo-access";

export function DemoGate({ demo }: { demo: DemoId }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/demo-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demo, code }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Sai mã");
      return;
    }
    router.refresh();
  }

  return (
    <form className="chat-shell" onSubmit={onSubmit}>
      <header className="chat-header">
        <strong>Mã truy cập demo</strong>
      </header>
      <div className="chat-composer">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          autoComplete="off"
          aria-label="Mã 6 ký tự"
        />
        <button type="submit" disabled={pending || code.length !== 6}>
          Vào
        </button>
      </div>
      {error ? <p className="chat-error">{error}</p> : null}
    </form>
  );
}
```

`app/page.tsx`

```tsx
import { cookies } from "next/headers";
import { DemoGate } from "@/app/components/DemoGate";
import { HomeChat } from "@/app/components/HomeChat";
import { cookieName } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const jar = await cookies();
  if (jar.get(cookieName("hyundai"))?.value !== "1") {
    return (
      <main>
        <DemoGate demo="hyundai" />
      </main>
    );
  }
  return (
    <main>
      <HomeChat />
      <p className="disclaimer">
        Demo chat với Minh — giá/thông số tham khảo, không phải tổng đài
        Hyundai.
      </p>
    </main>
  );
}
```

In `app/c/[sessionId]/page.tsx`, after the `sessionExists` check passes, if the hyundai cookie is missing render `<DemoGate demo="hyundai" />` instead of `<Chat>`. Use `cookies()` and `cookieName("hyundai")` the same way as the home page. Leave the not-found path as it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api-chat.test.ts tests/demo-access.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/components/DemoGate.tsx app/page.tsx app/c/[sessionId]/page.tsx app/api/chat/route.ts app/api/chat/sessions/[sessionId]/messages/route.ts tests/api-chat.test.ts
git commit -m "$(cat <<'EOF'
feat: require the hyundai demo cookie on web chat

EOF
)"
```

---

### Task 3: Field rules and face judgment

**Files:**
- Create: `lib/huggies/types.ts`
- Create: `lib/huggies/validate.ts`
- Create: `lib/huggies/qc.ts`
- Create: `lib/huggies/image.ts`
- Create: `tests/huggies-rules.test.ts`
- Modify: `lib/conversation/flow.ts` (add `export` to `foldVn`)

**Interfaces:**
- Consumes: `foldVn(s: string): string`
- Produces:
  - Types `StepId`, `Scenario`, `Gender`, `AgeRange`, `HobbyId`, `QcReason`, `FaceFacts`, `Session`, `TurnInput`, `TurnResult`, `Extracted`, `Button`
  - `parseBabyName(raw: string): string | null`
  - `parseDisplayName(raw: string): string | null`
  - `parseGenderToken(raw: string): Gender | null` (`1` boy, `2` girl, `3` unspecified)
  - `parseAgeToken(raw: string): AgeRange | null` (`1` `<1`, `2` `1-2`, `3` `2-3`, `4` `>3`)
  - `parseHobbyToken(raw: string): HobbyId | null` (`1`–`10` in `HOBBIES` order)
  - `judgeFace(facts: FaceFacts): { ok: true } | { ok: false; reason: QcReason }`
  - `imageMinEdge(bytes: Uint8Array): number | null`
  - `QC_THRESHOLDS` with the global-constraint numbers
  - `HOBBIES: { id: HobbyId; label: string }[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { imageMinEdge } from "@/lib/huggies/image";
import { judgeFace, QC_THRESHOLDS } from "@/lib/huggies/qc";
import type { FaceFacts } from "@/lib/huggies/types";
import {
  parseAgeToken,
  parseBabyName,
  parseDisplayName,
  parseGenderToken,
  parseHobbyToken,
} from "@/lib/huggies/validate";

const passFacts = (): FaceFacts => ({
  faceCount: 1,
  personCount: 1,
  confidence: 99,
  brightness: 80,
  sharpness: 80,
  yaw: 0,
  pitch: 0,
  occluded: false,
  minEdge: 800,
});

describe("huggies rules", () => {
  it("parses names and enum tokens", () => {
    expect(parseBabyName("  Bin  ")).toBe("Bin");
    expect(parseBabyName("https://x")).toBeNull();
    expect(parseBabyName("😀")).toBeNull();
    expect(parseDisplayName("Bình An nè")).toBeNull();
    expect(parseDisplayName("Bin")).toBe("Bin");
    expect(parseGenderToken("2")).toBe("girl");
    expect(parseAgeToken("2")).toBe("1-2");
    expect(parseHobbyToken("1")).toBe("cars");
    expect(parseHobbyToken("11")).toBeNull();
  });

  it("passes one clear face and rejects the pitch failure modes", () => {
    expect(judgeFace(passFacts()).ok).toBe(true);
    expect(judgeFace({ ...passFacts(), faceCount: 0 }).ok).toBe(false);
    expect(judgeFace({ ...passFacts(), faceCount: 2 })).toEqual({
      ok: false,
      reason: "multi_face",
    });
    expect(judgeFace({ ...passFacts(), personCount: 2 })).toEqual({
      ok: false,
      reason: "other_person",
    });
    expect(judgeFace({ ...passFacts(), sharpness: 10 })).toEqual({
      ok: false,
      reason: "blurry",
    });
    expect(judgeFace({ ...passFacts(), brightness: 10 })).toEqual({
      ok: false,
      reason: "too_dark",
    });
    expect(judgeFace({ ...passFacts(), occluded: true })).toEqual({
      ok: false,
      reason: "covered",
    });
    expect(judgeFace({ ...passFacts(), minEdge: 100 })).toEqual({
      ok: false,
      reason: "low_res",
    });
    expect(judgeFace({ ...passFacts(), yaw: 40 })).toEqual({
      ok: false,
      reason: "not_frontal",
    });
    expect(QC_THRESHOLDS.maxBytes).toBe(5_000_000);
  });

  it("reads a PNG min edge and rejects unknown bytes", () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    const view = new DataView(png.buffer);
    view.setUint32(16, 400);
    view.setUint32(20, 640);
    expect(imageMinEdge(png)).toBe(400);
    expect(imageMinEdge(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huggies-rules.test.ts`

Expected: FAIL with cannot find module `@/lib/huggies/validate`

- [ ] **Step 3: Write minimal implementation**

Change line 1 of `lib/conversation/flow.ts` from `function foldVn` to `export function foldVn`.

`lib/huggies/types.ts`

```ts
export type StepId =
  | "welcome"
  | "consent"
  | "baby_name"
  | "display_name"
  | "gender"
  | "age_range"
  | "hobby"
  | "photo"
  | "confirm"
  | "processing"
  | "result"
  | "error"
  | "cs"
  | "end";

export type Scenario = "success" | "error_photo_invalid" | "error_render";
export type Gender = "boy" | "girl" | "unspecified";
export type AgeRange = "<1" | "1-2" | "2-3" | ">3";
export type HobbyId =
  | "cars"
  | "animals"
  | "music"
  | "dance"
  | "sports"
  | "princess"
  | "space"
  | "art"
  | "toys"
  | "nature";

export type QcReason =
  | "no_face"
  | "multi_face"
  | "other_person"
  | "blurry"
  | "too_dark"
  | "covered"
  | "low_res"
  | "not_frontal"
  | "bad_type"
  | "too_large";

export type FaceFacts = {
  faceCount: number;
  personCount: number;
  confidence: number;
  brightness: number;
  sharpness: number;
  yaw: number;
  pitch: number;
  occluded: boolean;
  minEdge: number;
};

export type Button = { id: string; label: string };

export type Fields = {
  consent: boolean;
  consentAt: string | null;
  termsVersion: string;
  babyName: string | null;
  displayName: string | null;
  gender: Gender | null;
  ageRange: AgeRange | null;
  hobby: HobbyId | null;
  photoOk: boolean;
};

export type Job = {
  id: string;
  status: "processing" | "done" | "error";
  templateId: string | null;
  videoUrl: string | null;
  previewUrl: string | null;
  errorCode: "render_fail" | "config" | null;
  retries: number;
  readyAt: number;
  announced: boolean;
};

export type Session = {
  id: string;
  scenario: Scenario;
  ai: boolean;
  step: StepId;
  fields: Fields;
  photoFails: number;
  fakeReasonIndex: number;
  editMenu: boolean;
  returnTo: StepId | null;
  job: Job | null;
};

export type QcOutcome =
  | { ok: true }
  | { ok: false; reason: QcReason }
  | { awsError: true };

export type TurnInput = {
  type: "text" | "button" | "image";
  text?: string;
  buttonId?: string;
  qc?: QcOutcome;
};

export type Extracted = {
  babyName?: string | null;
  displayName?: string | null;
  gender?: Gender | null;
  ageRange?: AgeRange | null;
  hobby?: HobbyId | null;
  confirm?: boolean;
  reply?: string | null;
};

export type TurnResult = {
  session: Session;
  messages: string[];
  buttons: Button[];
  jobId: string | null;
  restart: boolean;
};
```

`lib/huggies/validate.ts`

```ts
import type { AgeRange, Gender, HobbyId } from "@/lib/huggies/types";

export const HOBBIES: { id: HobbyId; label: string }[] = [
  { id: "cars", label: "Xe hơi" },
  { id: "animals", label: "Động vật" },
  { id: "music", label: "Âm nhạc" },
  { id: "dance", label: "Nhảy múa" },
  { id: "sports", label: "Thể thao" },
  { id: "princess", label: "Công chúa / cổ tích" },
  { id: "space", label: "Vũ trụ" },
  { id: "art", label: "Vẽ / sáng tạo" },
  { id: "toys", label: "Đồ chơi" },
  { id: "nature", label: "Thiên nhiên" },
];

export function parseBabyName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return null;
  if (/https?:\/\//i.test(name)) return null;
  if (!/[\p{L}\p{N}]/u.test(name)) return null;
  return name;
}

export function parseDisplayName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > 12) return null;
  if (/[<>]/.test(name)) return null;
  return name;
}

export function parseGenderToken(raw: string): Gender | null {
  if (raw.trim() === "1") return "boy";
  if (raw.trim() === "2") return "girl";
  if (raw.trim() === "3") return "unspecified";
  return null;
}

export function parseAgeToken(raw: string): AgeRange | null {
  const n = raw.trim();
  if (n === "1") return "<1";
  if (n === "2") return "1-2";
  if (n === "3") return "2-3";
  if (n === "4") return ">3";
  return null;
}

export function parseHobbyToken(raw: string): HobbyId | null {
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > HOBBIES.length) return null;
  return HOBBIES[n - 1].id;
}
```

`lib/huggies/qc.ts`

```ts
import type { FaceFacts, QcReason } from "@/lib/huggies/types";

export const QC_THRESHOLDS = {
  minConfidence: 90,
  minBrightness: 40,
  minSharpness: 40,
  maxYaw: 25,
  maxPitch: 25,
  minEdge: 400,
  maxBytes: 5_000_000,
};

export function judgeFace(
  facts: FaceFacts,
): { ok: true } | { ok: false; reason: QcReason } {
  const t = QC_THRESHOLDS;
  if (facts.minEdge < t.minEdge) return { ok: false, reason: "low_res" };
  if (facts.faceCount <= 0) return { ok: false, reason: "no_face" };
  if (facts.faceCount > 1) return { ok: false, reason: "multi_face" };
  if (facts.personCount > 1) return { ok: false, reason: "other_person" };
  if (facts.confidence < t.minConfidence) return { ok: false, reason: "no_face" };
  if (facts.occluded) return { ok: false, reason: "covered" };
  if (facts.brightness < t.minBrightness) return { ok: false, reason: "too_dark" };
  if (facts.sharpness < t.minSharpness) return { ok: false, reason: "blurry" };
  if (Math.abs(facts.yaw) > t.maxYaw || Math.abs(facts.pitch) > t.maxPitch) {
    return { ok: false, reason: "not_frontal" };
  }
  return { ok: true };
}
```

`lib/huggies/image.ts`

```ts
export function imageMinEdge(bytes: Uint8Array): number | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const w = view.getUint32(16);
    const h = view.getUint32(20);
    return Math.min(w, h);
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      const sof = marker >= 0xc0 && marker <= 0xc3;
      if (sof) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const h = view.getUint16(i + 5);
        const w = view.getUint16(i + 7);
        return Math.min(w, h);
      }
      const len = (bytes[i + 2] << 8) + bytes[i + 3];
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/huggies-rules.test.ts tests/flow.test.ts`

Expected: PASS (`flow.test.ts` still passes after exporting `foldVn`)

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/types.ts lib/huggies/validate.ts lib/huggies/qc.ts lib/huggies/image.ts lib/conversation/flow.ts tests/huggies-rules.test.ts
git commit -m "$(cat <<'EOF'
feat: add Huggies field parsers and face QC rules

EOF
)"
```

---

### Task 4: State machine, photo outcomes, and jobs

**Files:**
- Create: `lib/huggies/copy.ts`
- Create: `lib/huggies/machine.ts`
- Create: `tests/huggies-machine.test.ts`

**Interfaces:**
- Consumes: Task 3 types, parsers, `HOBBIES`, `foldVn`
- Produces:
  - `export function freshSession(input: { id: string; scenario: Scenario; ai: boolean; termsVersion: string }): Session`
  - `export async function applyTurn(session: Session, input: TurnInput, deps: MachineDeps): Promise<TurnResult>`
  - `export function settle(session: Session, deps: MachineDeps): TurnResult`
  - `export type MachineDeps = { now: () => number; delayMs: number; newJobId: () => string; videoUrls: string[]; pickVideo: (urls: string[]) => string; previewUrl: string | null; learnMoreUrl: string; termsUrl: string; extract?: (step: StepId, text: string) => Promise<Extracted> }`
  - `export const FAKE_REASONS: QcReason[]`
  - `export function qcUserCopy(reason: QcReason): string`

Machine rules to implement inside `applyTurn` / `settle` (clone the session with `structuredClone` before mutating):

- `welcome`: button `start` or text `1` / `bắt đầu` / `choi` → `consent`. Else fallback “Ba mẹ bấm Bắt đầu hoặc gõ 1 giúp mình nhé.”
- `consent`: `1` or `yes` sets `consent`, `consentAt` from `deps.now()` as ISO, `termsVersion`, step `baby_name`. `2` or `terms` stays and includes `deps.termsUrl`. `3` or `no` → step `end`.
- Collect steps accept button id or the token parsers. Invalid input repeats the step prompt and does not increment a counter.
- `display_name` button `keep` copies `babyName` only when that name length is `<= 12`.
- Confirm button `1` / text `1`: if any field or `photoOk` is missing, step becomes `nextIncomplete` (order: consent, baby name, display name, gender, age, hobby, photo, confirm). If complete and `job` is null, create one job (`status: "processing"`, `retries: 0`, `readyAt: now + delayMs`, `templateId: "tpl_" + hobby + "_v1"`, `announced: false`) and step `processing`. A second confirm returns the same `job.id` and does not change `readyAt`.
- Confirm `2` sets `editMenu`. Edit buttons `edit_name`, `edit_display`, `edit_gender`, `edit_age`, `edit_hobby` set `returnTo: "confirm"` and the matching step. `3` / `edit_photo` clears `photoOk`, sets `photoFails` to `0`, `returnTo: "confirm"`, step `photo`.
- When a collect step finishes and `returnTo` is set, go to `returnTo` and clear it.
- Photo + text: “Ba mẹ gửi 1 ảnh mặt bé rõ giúp mình nhé.” Do not change `photoFails`.
- Image while step is not `photo`: resend the current prompt. Do not change `photoFails`.
- Photo + `qc.awsError`: “Mình chưa kiểm tra được ảnh. Ba mẹ gửi lại giúp mình nhé.” Do not change `photoFails`.
- Photo + `qc.ok === false`: increment `photoFails`, message includes `qcUserCopy(reason)`.
- Photo + `qc.ok === true` and scenario `error_photo_invalid`: increment `photoFails` and `fakeReasonIndex`, reason is `FAKE_REASONS[index % length]`.
- Photo + pass on `success` or `error_render`: `photoOk = true`, step `confirm` (or `returnTo`).
- `photoFails >= 3`: step `cs`, message “Mình đã nhận 3 ảnh chưa đạt. Ba mẹ nhắn tư vấn viên để được hỗ trợ thêm nhé.” No job.
- `ai === true` and `extract` throws: current step, message “Mình chưa nghe rõ. Ba mẹ chọn nút hoặc gõ số giúp mình nhé.” Do not apply a partial update.
- `ai === true` and extract returns valid fields on a collect step: write them, then step = first missing. Message is only `promptFor` of the new step.
- `settle`: if step is not `processing` or `now < job.readyAt`, return the same session and no new messages. `success` with a non-empty URL list sets `videoUrl` once via `pickVideo`, `previewUrl`, `status: "done"`, step `result`. Empty list: `errorCode: "config"`, step `error`, `videoUrl: null`. `error_render`: `errorCode: "render_fail"`, step `error`. Calling `settle` again does not call `pickVideo` again.
- Error buttons: `retry` only when `errorCode === "render_fail"` and `retries < 2`, plus `cs` and `end`. `retry` increments `retries`, sets step `processing`, new `readyAt`, same `job.id`.
- Result buttons: `share`, `replay`, `learn`. `replay` sets `restart: true` and does not mutate fields. `share` repeats `videoUrl`. `learn` sends `learnMoreUrl`.
- Processing + text: “Video đang xử lý. Ba mẹ chờ mình một chút nhé.” Job unchanged.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  applyTurn,
  freshSession,
  settle,
  type MachineDeps,
} from "@/lib/huggies/machine";
import type { Session, TurnInput } from "@/lib/huggies/types";

function deps(over: Partial<MachineDeps> = {}): MachineDeps {
  return {
    now: () => 1_700_000_000_000,
    delayMs: 3000,
    newJobId: () => "job_1",
    videoUrls: ["https://s3.example/a.mp4"],
    pickVideo: (urls) => urls[0],
    previewUrl: "https://s3.example/preview.jpg",
    learnMoreUrl: "https://huggies.example",
    termsUrl: "https://terms.example",
    ...over,
  };
}

async function say(session: Session, text: string, d = deps()) {
  return applyTurn(session, { type: "text", text }, d);
}

async function toConfirm(ai = false) {
  let s = freshSession({
    id: "s1",
    scenario: "success",
    ai,
    termsVersion: "huggies-video-2026-11",
  });
  for (const text of ["1", "1", "Bin", "Bin", "1", "2", "1"]) {
    s = (await say(s, text)).session;
  }
  const photo = await applyTurn(
    s,
    { type: "image", qc: { ok: true } },
    deps(),
  );
  expect(photo.session.step).toBe("confirm");
  return photo.session;
}

describe("huggies machine", () => {
  it("walks ai=off from welcome to confirm with numbers", async () => {
    const session = await toConfirm(false);
    expect(session.fields.babyName).toBe("Bin");
    expect(session.fields.gender).toBe("boy");
    expect(session.fields.hobby).toBe("cars");
    expect(session.fields.photoOk).toBe(true);
  });

  it("jumps to the next missing field when extract fills several", async () => {
    const extract = vi.fn(async () => ({
      babyName: "Bin",
      gender: "boy" as const,
      hobby: "cars" as const,
      reply: "dạ",
    }));
    let s = freshSession({
      id: "s1",
      scenario: "success",
      ai: true,
      termsVersion: "huggies-video-2026-11",
    });
    s = (await say(s, "1")).session;
    s = (await say(s, "1")).session;
    const out = await applyTurn(
      s,
      { type: "text", text: "bé tên Bin, con trai, thích xe" },
      deps({ extract }),
    );
    expect(out.session.step).toBe("display_name");
    expect(out.session.fields.hobby).toBe("cars");
    expect(out.messages.join(" ")).not.toContain("dạ");
  });

  it("keeps the step when extract throws", async () => {
    const extract = vi.fn(async () => {
      throw new Error("bad json");
    });
    let s = freshSession({
      id: "s1",
      scenario: "success",
      ai: true,
      termsVersion: "huggies-video-2026-11",
    });
    s = (await say(s, "1")).session;
    s = (await say(s, "1")).session;
    const out = await applyTurn(s, { type: "text", text: "Bin" }, deps({ extract }));
    expect(out.session.step).toBe("baby_name");
    expect(out.session.fields.babyName).toBeNull();
  });

  it("creates one job and one stable video url", async () => {
    const pickVideo = vi.fn((urls: string[]) => urls[0]);
    const d = deps({ pickVideo, videoUrls: ["https://s3.example/a.mp4", "https://s3.example/b.mp4"] });
    const ready = await toConfirm();
    const first = await applyTurn(ready, { type: "text", text: "1" }, d);
    const second = await applyTurn(first.session, { type: "text", text: "1" }, d);
    expect(first.jobId).toBe("job_1");
    expect(second.jobId).toBe("job_1");
    expect(second.session.job?.readyAt).toBe(first.session.job?.readyAt);
    const done = settle(
      first.session,
      deps({ ...d, now: () => 1_700_000_000_000 + 3000 }),
    );
    const again = settle(done.session, deps({ ...d, now: () => 1_700_000_000_000 + 9000 }));
    expect(done.session.step).toBe("result");
    expect(done.session.job?.videoUrl).toBe("https://s3.example/a.mp4");
    expect(again.session.job?.videoUrl).toBe(done.session.job?.videoUrl);
    expect(pickVideo).toHaveBeenCalledTimes(1);
  });

  it("force-fails a passing photo three times then hands off without a job", async () => {
    let s = freshSession({
      id: "s1",
      scenario: "error_photo_invalid",
      ai: false,
      termsVersion: "huggies-video-2026-11",
    });
    for (const text of ["1", "1", "Bin", "Bin", "1", "2", "1"]) {
      s = (await say(s, text)).session;
    }
    expect(s.step).toBe("photo");
    for (let i = 0; i < 2; i += 1) {
      const out = await applyTurn(s, { type: "image", qc: { ok: true } }, deps());
      expect(out.session.step).toBe("photo");
      expect(out.session.job).toBeNull();
      s = out.session;
    }
    const last = await applyTurn(s, { type: "image", qc: { ok: true } }, deps());
    expect(last.session.step).toBe("cs");
    expect(last.session.job).toBeNull();
    expect(last.session.photoFails).toBe(3);
  });

  it("counts a real QC miss and ignores an AWS error", async () => {
    let s = freshSession({
      id: "s1",
      scenario: "success",
      ai: false,
      termsVersion: "huggies-video-2026-11",
    });
    for (const text of ["1", "1", "Bin", "Bin", "1", "2", "1"]) {
      s = (await say(s, text)).session;
    }
    const aws = await applyTurn(s, { type: "image", qc: { awsError: true } }, deps());
    expect(aws.session.photoFails).toBe(0);
    const bad = await applyTurn(
      aws.session,
      { type: "image", qc: { ok: false, reason: "multi_face" } },
      deps(),
    );
    expect(bad.session.photoFails).toBe(1);
    expect(bad.messages.join(" ")).toContain("nhiều hơn 1 khuôn mặt");
    const typed = await applyTurn(bad.session, { type: "text", text: "hello" }, deps());
    expect(typed.session.photoFails).toBe(1);
  });

  it("fails render twice on retry and then removes retry", async () => {
    let s = await toConfirm();
    s.scenario = "error_render";
    s = (await applyTurn(s, { type: "text", text: "1" }, deps())).session;
    const clock = { t: 1_700_000_000_000 + 3000 };
    let out = settle(s, deps({ now: () => clock.t }));
    expect(out.session.step).toBe("error");
    expect(out.buttons.map((b) => b.id)).toContain("retry");
    out = await applyTurn(out.session, { type: "button", buttonId: "retry" }, deps());
    clock.t += 3000;
    out = settle(out.session, deps({ now: () => clock.t }));
    expect(out.buttons.map((b) => b.id)).toContain("retry");
    out = await applyTurn(out.session, { type: "button", buttonId: "retry" }, deps());
    clock.t += 3000;
    out = settle(out.session, deps({ now: () => clock.t }));
    expect(out.session.job?.retries).toBe(2);
    expect(out.session.job?.errorCode).toBe("render_fail");
    expect(out.buttons.map((b) => b.id)).not.toContain("retry");
    expect(out.buttons.map((b) => b.id)).toContain("cs");
  });

  it("reports an empty video list without a url", async () => {
    const ready = await toConfirm();
    const started = await applyTurn(ready, { type: "text", text: "1" }, deps({ videoUrls: [] }));
    const done = settle(started.session, deps({
      videoUrls: [],
      now: () => 1_700_000_000_000 + 3000,
    }));
    expect(done.session.step).toBe("error");
    expect(done.session.job?.videoUrl).toBeNull();
    expect(done.session.job?.errorCode).toBe("config");
    expect(done.messages.join(" ")).not.toContain("Error:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huggies-machine.test.ts`

Expected: FAIL with cannot find module `@/lib/huggies/machine`

- [ ] **Step 3: Write minimal implementation**

`lib/huggies/copy.ts`:

```ts
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
```

`lib/huggies/machine.ts`:

```ts
import { foldVn } from "@/lib/conversation/flow";
import { promptFor, qcUserCopy } from "@/lib/huggies/copy";
import type {
  AgeRange,
  Button,
  Extracted,
  Gender,
  HobbyId,
  QcReason,
  Scenario,
  Session,
  StepId,
  TurnInput,
  TurnResult,
} from "@/lib/huggies/types";
import {
  HOBBIES,
  parseAgeToken,
  parseBabyName,
  parseDisplayName,
  parseGenderToken,
  parseHobbyToken,
} from "@/lib/huggies/validate";

export const FAKE_REASONS: QcReason[] = [
  "no_face",
  "blurry",
  "too_dark",
  "covered",
  "low_res",
  "multi_face",
];

export type MachineDeps = {
  now: () => number;
  delayMs: number;
  newJobId: () => string;
  videoUrls: string[];
  pickVideo: (urls: string[]) => string;
  previewUrl: string | null;
  learnMoreUrl: string;
  termsUrl: string;
  extract?: (step: StepId, text: string) => Promise<Extracted>;
};

const COLLECT: StepId[] = [
  "baby_name",
  "display_name",
  "gender",
  "age_range",
  "hobby",
  "confirm",
];

export function freshSession(input: {
  id: string;
  scenario: Scenario;
  ai: boolean;
  termsVersion: string;
}): Session {
  return {
    id: input.id,
    scenario: input.scenario,
    ai: input.ai,
    step: "welcome",
    fields: {
      consent: false,
      consentAt: null,
      termsVersion: input.termsVersion,
      babyName: null,
      displayName: null,
      gender: null,
      ageRange: null,
      hobby: null,
      photoOk: false,
    },
    photoFails: 0,
    fakeReasonIndex: 0,
    editMenu: false,
    returnTo: null,
    job: null,
  };
}

function nextIncomplete(session: Session): StepId {
  const f = session.fields;
  if (!f.consent) return "consent";
  if (!f.babyName) return "baby_name";
  if (!f.displayName) return "display_name";
  if (!f.gender) return "gender";
  if (!f.ageRange) return "age_range";
  if (!f.hobby) return "hobby";
  if (!f.photoOk) return "photo";
  return "confirm";
}

function errorButtons(session: Session): Button[] {
  const buttons: Button[] = [];
  if (session.job?.errorCode === "render_fail" && session.job.retries < 2) {
    buttons.push({ id: "retry", label: "Thử lại" });
  }
  buttons.push({ id: "cs", label: "Gặp tư vấn viên" });
  buttons.push({ id: "end", label: "Kết thúc" });
  return buttons;
}

function view(session: Session, extra: Partial<TurnResult> = {}): TurnResult {
  const prompt = promptFor(session);
  return {
    session,
    messages: extra.messages ?? [prompt.text],
    buttons:
      extra.buttons ??
      (session.step === "error" ? errorButtons(session) : prompt.buttons),
    jobId: session.job?.id ?? null,
    restart: extra.restart ?? false,
  };
}

function norm(text?: string): string {
  return foldVn(text ?? "").trim();
}

function go(session: Session, linear: StepId) {
  if (session.returnTo) {
    session.step = session.returnTo;
    session.returnTo = null;
    session.editMenu = false;
    return;
  }
  session.step = linear;
}

function applyExtracted(session: Session, extracted: Extracted): boolean {
  let applied = false;
  if (extracted.babyName) {
    const name = parseBabyName(extracted.babyName);
    if (name) {
      session.fields.babyName = name;
      applied = true;
    }
  }
  if (extracted.displayName) {
    const name = parseDisplayName(extracted.displayName);
    if (name) {
      session.fields.displayName = name;
      applied = true;
    }
  }
  if (
    extracted.gender === "boy" ||
    extracted.gender === "girl" ||
    extracted.gender === "unspecified"
  ) {
    session.fields.gender = extracted.gender;
    applied = true;
  }
  if (
    extracted.ageRange === "<1" ||
    extracted.ageRange === "1-2" ||
    extracted.ageRange === "2-3" ||
    extracted.ageRange === ">3"
  ) {
    session.fields.ageRange = extracted.ageRange;
    applied = true;
  }
  if (extracted.hobby && HOBBIES.some((h) => h.id === extracted.hobby)) {
    session.fields.hobby = extracted.hobby;
    applied = true;
  }
  return applied;
}

function confirmJob(session: Session, deps: MachineDeps): TurnResult {
  const missing = nextIncomplete(session);
  if (missing !== "confirm") {
    session.step = missing;
    session.editMenu = false;
    return view(session);
  }
  if (!session.job) {
    session.job = {
      id: deps.newJobId(),
      status: "processing",
      templateId: `tpl_${session.fields.hobby}_v1`,
      videoUrl: null,
      previewUrl: null,
      errorCode: null,
      retries: 0,
      readyAt: deps.now() + deps.delayMs,
      announced: false,
    };
  }
  session.step = "processing";
  session.editMenu = false;
  return view(session);
}

function failPhoto(session: Session, reason: QcReason): TurnResult {
  session.photoFails += 1;
  if (session.photoFails >= 3) {
    session.step = "cs";
    return view(session, {
      messages: [
        "Mình đã nhận 3 ảnh chưa đạt. Ba mẹ nhắn tư vấn viên để được hỗ trợ thêm nhé.",
      ],
    });
  }
  return view(session, {
    messages: [
      `Ảnh chưa đạt (${qcUserCopy(reason)}). Ba mẹ gửi lại ảnh khác giúp mình nhé.`,
    ],
  });
}

function genderOf(input: TurnInput): Gender | null {
  if (
    input.buttonId === "boy" ||
    input.buttonId === "girl" ||
    input.buttonId === "unspecified"
  ) {
    return input.buttonId;
  }
  return parseGenderToken(input.text ?? "");
}

function ageOf(input: TurnInput): AgeRange | null {
  if (input.buttonId?.startsWith("age_")) return parseAgeToken(input.buttonId.slice(4));
  return parseAgeToken(input.text ?? "");
}

function hobbyOf(input: TurnInput): HobbyId | null {
  if (input.buttonId && HOBBIES.some((h) => h.id === input.buttonId)) {
    return input.buttonId as HobbyId;
  }
  return parseHobbyToken(input.text ?? "");
}

function applyRigid(session: Session, input: TurnInput, deps: MachineDeps): TurnResult {
  if (session.step === "processing") {
    return view(session, {
      messages: ["Video đang xử lý. Ba mẹ chờ mình một chút nhé."],
      buttons: [],
    });
  }
  if (input.type === "image" && session.step !== "photo") return view(session);

  const t = norm(input.text);
  switch (session.step) {
    case "welcome": {
      const start =
        input.buttonId === "start" || t === "1" || t === "bat dau" || t === "choi";
      if (!start) {
        return view(session, {
          messages: ["Ba mẹ bấm Bắt đầu hoặc gõ 1 giúp mình nhé."],
        });
      }
      session.step = "consent";
      return view(session);
    }
    case "consent": {
      const choice =
        input.buttonId === "yes" || input.buttonId === "terms" || input.buttonId === "no"
          ? input.buttonId
          : t === "1" || t === "dong y"
            ? "yes"
            : t === "2" || t === "xem dieu khoan" || t === "xem"
              ? "terms"
              : t === "3" || t === "khong" || t === "khong dong y"
                ? "no"
                : null;
      if (choice === "yes") {
        session.fields.consent = true;
        session.fields.consentAt = new Date(deps.now()).toISOString();
        session.step = "baby_name";
        return view(session);
      }
      if (choice === "terms") {
        return view(session, {
          messages: [`Điều khoản: ${deps.termsUrl}`, promptFor(session).text],
        });
      }
      if (choice === "no") {
        session.step = "end";
        return view(session);
      }
      return view(session);
    }
    case "baby_name": {
      const name = parseBabyName(input.text ?? "");
      if (!name) return view(session);
      session.fields.babyName = name;
      go(session, "display_name");
      return view(session);
    }
    case "display_name": {
      if (
        input.buttonId === "keep" &&
        session.fields.babyName &&
        session.fields.babyName.length <= 12
      ) {
        session.fields.displayName = session.fields.babyName;
        go(session, "gender");
        return view(session);
      }
      const name = parseDisplayName(input.text ?? "");
      if (!name) return view(session);
      session.fields.displayName = name;
      go(session, "gender");
      return view(session);
    }
    case "gender": {
      const gender = genderOf(input);
      if (!gender) return view(session);
      session.fields.gender = gender;
      go(session, "age_range");
      return view(session);
    }
    case "age_range": {
      const age = ageOf(input);
      if (!age) return view(session);
      session.fields.ageRange = age;
      go(session, "hobby");
      return view(session);
    }
    case "hobby": {
      const hobby = hobbyOf(input);
      if (!hobby) return view(session);
      session.fields.hobby = hobby;
      go(session, "photo");
      return view(session);
    }
    case "photo": {
      if (input.type !== "image") {
        return view(session, {
          messages: ["Ba mẹ gửi 1 ảnh mặt bé rõ giúp mình nhé."],
        });
      }
      if (!input.qc || "awsError" in input.qc) {
        return view(session, {
          messages: ["Mình chưa kiểm tra được ảnh. Ba mẹ gửi lại giúp mình nhé."],
        });
      }
      if (!input.qc.ok) return failPhoto(session, input.qc.reason);
      if (session.scenario === "error_photo_invalid") {
        const reason = FAKE_REASONS[session.fakeReasonIndex % FAKE_REASONS.length];
        session.fakeReasonIndex += 1;
        return failPhoto(session, reason);
      }
      session.fields.photoOk = true;
      go(session, "confirm");
      return view(session);
    }
    case "confirm": {
      const editTo: Record<string, StepId> = {
        edit_name: "baby_name",
        edit_display: "display_name",
        edit_gender: "gender",
        edit_age: "age_range",
        edit_hobby: "hobby",
      };
      if (input.buttonId && editTo[input.buttonId]) {
        session.returnTo = "confirm";
        session.editMenu = false;
        session.step = editTo[input.buttonId];
        return view(session);
      }
      if (input.buttonId === "edit_photo" || t === "3") {
        session.fields.photoOk = false;
        session.photoFails = 0;
        session.returnTo = "confirm";
        session.editMenu = false;
        session.step = "photo";
        return view(session);
      }
      if (input.buttonId === "edit" || t === "2") {
        session.editMenu = true;
        return view(session);
      }
      if (input.buttonId === "confirm" || t === "1") return confirmJob(session, deps);
      return view(session);
    }
    case "error": {
      if (
        (input.buttonId === "retry" || t === "1") &&
        session.job?.errorCode === "render_fail" &&
        session.job.retries < 2
      ) {
        session.job.retries += 1;
        session.job.status = "processing";
        session.job.errorCode = null;
        session.job.readyAt = deps.now() + deps.delayMs;
        session.job.announced = false;
        session.step = "processing";
        return view(session);
      }
      if (input.buttonId === "cs" || t === "2") {
        session.step = "cs";
        return view(session);
      }
      if (input.buttonId === "end" || t === "3") {
        session.step = "end";
        return view(session);
      }
      return view(session);
    }
    case "result": {
      if (input.buttonId === "share" || t === "1") {
        return view(session, { messages: [session.job?.videoUrl ?? ""] });
      }
      if (input.buttonId === "replay" || t === "2") {
        return view(session, { restart: true });
      }
      if (input.buttonId === "learn" || t === "3") {
        return view(session, { messages: [deps.learnMoreUrl] });
      }
      return view(session);
    }
    default:
      return view(session);
  }
}

export async function applyTurn(
  inputSession: Session,
  input: TurnInput,
  deps: MachineDeps,
): Promise<TurnResult> {
  const session = structuredClone(inputSession);
  if (
    session.ai &&
    deps.extract &&
    input.type === "text" &&
    input.text &&
    COLLECT.includes(session.step)
  ) {
    try {
      const extracted = await deps.extract(session.step, input.text);
      const applied = applyExtracted(session, extracted);
      if (session.step === "confirm" && extracted.confirm) return confirmJob(session, deps);
      if (applied && session.step !== "confirm") {
        session.step = nextIncomplete(session);
        session.editMenu = false;
        return view(session);
      }
      if (!applied && extracted.reply) return view(session, { messages: [extracted.reply] });
    } catch {
      return view(session, {
        messages: ["Mình chưa nghe rõ. Ba mẹ chọn nút hoặc gõ số giúp mình nhé."],
      });
    }
  }
  return applyRigid(session, input, deps);
}

export function settle(inputSession: Session, deps: MachineDeps): TurnResult {
  const session = structuredClone(inputSession);
  if (session.step !== "processing" || !session.job) {
    return {
      session,
      messages: [],
      buttons: session.step === "error" ? errorButtons(session) : [],
      jobId: session.job?.id ?? null,
      restart: false,
    };
  }
  if (deps.now() < session.job.readyAt) {
    return { session, messages: [], buttons: [], jobId: session.job.id, restart: false };
  }
  if (session.scenario === "error_render") {
    session.job.status = "error";
    session.job.errorCode = "render_fail";
    session.job.videoUrl = null;
    session.step = "error";
    return view(session);
  }
  if (deps.videoUrls.length === 0) {
    session.job.status = "error";
    session.job.errorCode = "config";
    session.job.videoUrl = null;
    session.step = "error";
    return view(session);
  }
  session.job.videoUrl = deps.pickVideo(deps.videoUrls);
  session.job.previewUrl = deps.previewUrl;
  session.job.status = "done";
  session.job.errorCode = null;
  session.step = "result";
  return view(session);
}
```

- [ ] **Step 4: Run test to verify it passes**


Run: `npx vitest run tests/huggies-machine.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/copy.ts lib/huggies/machine.ts tests/huggies-machine.test.ts
git commit -m "$(cat <<'EOF'
feat: add the Huggies pitch state machine

EOF
)"
```

---

### Task 5: LLM extract

**Files:**
- Create: `lib/huggies/ai.ts`
- Create: `tests/huggies-ai.test.ts`

**Interfaces:**
- Consumes: `Extracted`, `StepId`, `LlmProvider.chat(messages): Promise<string>`
- Produces: `export async function extractFields(llm: LlmProvider, step: StepId, text: string, timeoutMs?: number): Promise<Extracted>`
- Default `timeoutMs` is `2000`. Timeout or non-JSON throws `Error`.

The system prompt must say: return one JSON object only, keys `babyName`, `displayName`, `gender` (`boy|girl|unspecified|null`), `ageRange` (`<1|1-2|2-3|>3|null`), `hobby` (one of the 10 ids or null), `confirm` boolean, `reply` string. Do not invent a hobby outside the list. Do not infer gender from a photo. The user message is the raw text. Strip a ```json fence before `JSON.parse`. Drop keys whose values fail the Task 3 parsers (`parseBabyName`, `parseDisplayName`, gender union, age union, hobby id).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { extractFields } from "@/lib/huggies/ai";
import type { LlmProvider } from "@/lib/llm";

function llm(reply: string | Promise<string>): LlmProvider {
  return { chat: () => Promise.resolve(reply) };
}

describe("extractFields", () => {
  it("parses a fenced JSON object and drops an unknown hobby", async () => {
    const out = await extractFields(
      llm('```json\n{"babyName":"Bin","gender":"boy","hobby":"rocket","reply":"ok"}\n```'),
      "baby_name",
      "bé tên Bin",
    );
    expect(out.babyName).toBe("Bin");
    expect(out.gender).toBe("boy");
    expect(out.hobby).toBeUndefined();
  });

  it("throws when the model exceeds the timeout", async () => {
    const slow: LlmProvider = {
      chat: () => new Promise((resolve) => setTimeout(() => resolve("{}"), 50)),
    };
    await expect(extractFields(slow, "baby_name", "Bin", 10)).rejects.toThrow(
      /timeout/i,
    );
  });

  it("throws on prose", async () => {
    await expect(
      extractFields(llm("xin lỗi mình không hiểu"), "baby_name", "???"),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huggies-ai.test.ts`

Expected: FAIL with cannot find module `@/lib/huggies/ai`

- [ ] **Step 3: Write minimal implementation**

`lib/huggies/ai.ts`:

```ts
import type { LlmProvider } from "@/lib/llm";
import type { Extracted, HobbyId, StepId } from "@/lib/huggies/types";
import {
  HOBBIES,
  parseBabyName,
  parseDisplayName,
} from "@/lib/huggies/validate";

const HOBBY_IDS = new Set<string>(HOBBIES.map((h) => h.id));

export async function extractFields(
  llm: LlmProvider,
  step: StepId,
  text: string,
  timeoutMs = 2000,
): Promise<Extracted> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM timeout")), timeoutMs);
  });
  try {
    const raw = await Promise.race([
      llm.chat([
        {
          role: "system",
          content:
            "Return one JSON object only. Keys: babyName, displayName, gender (boy|girl|unspecified|null), ageRange (<1|1-2|2-3|>3|null), hobby (cars|animals|music|dance|sports|princess|space|art|toys|nature|null), confirm boolean, reply string. Do not invent a hobby. Do not infer gender from a photo. Step: " +
            step,
        },
        { role: "user", content: text },
      ]),
      timeout,
    ]);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("invalid json");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const out: Extracted = {};
    if (typeof parsed.babyName === "string") {
      const name = parseBabyName(parsed.babyName);
      if (name) out.babyName = name;
    }
    if (typeof parsed.displayName === "string") {
      const name = parseDisplayName(parsed.displayName);
      if (name) out.displayName = name;
    }
    if (parsed.gender === "boy" || parsed.gender === "girl" || parsed.gender === "unspecified") {
      out.gender = parsed.gender;
    }
    if (
      parsed.ageRange === "<1" ||
      parsed.ageRange === "1-2" ||
      parsed.ageRange === "2-3" ||
      parsed.ageRange === ">3"
    ) {
      out.ageRange = parsed.ageRange;
    }
    if (typeof parsed.hobby === "string" && HOBBY_IDS.has(parsed.hobby)) {
      out.hobby = parsed.hobby as HobbyId;
    }
    if (parsed.confirm === true) out.confirm = true;
    if (typeof parsed.reply === "string") out.reply = parsed.reply;
    return out;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/huggies-ai.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/ai.ts tests/huggies-ai.test.ts
git commit -m "$(cat <<'EOF'
feat: extract Huggies fields as strict JSON

EOF
)"
```

---

### Task 6: Rekognition adapter

**Files:**
- Create: `lib/huggies/rekognition.ts`
- Create: `tests/huggies-rekognition.test.ts`
- Modify: `package.json` / `package-lock.json` via npm

**Interfaces:**
- Consumes: `FaceFacts`
- Produces: `export async function detectFaceFacts(bytes: Uint8Array, client: { send: (cmd: unknown) => Promise<unknown> }): Promise<FaceFacts>`
- The route in Task 7 constructs `RekognitionClient` from `AWS_REGION` when this function is called with one argument. Tests always pass the fake client.

`send` is called twice. First command is `DetectFacesCommand` with `Attributes: ["ALL"]`. Second is `DetectLabelsCommand` with `MaxLabels: 20`. Map the first face's `Confidence`, `Quality.Brightness`, `Quality.Sharpness`, `Pose.Yaw`, `Pose.Pitch`, `FaceOccluded.Value`. `faceCount` is `FaceDetails.length`. `personCount` is the `Person` label's `Instances.length`, or `1` when that label exists without instances, or `faceCount` when the label is absent. `minEdge` is not set here; the route overwrites it from `imageMinEdge`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { detectFaceFacts } from "@/lib/huggies/rekognition";

describe("detectFaceFacts", () => {
  it("maps one face and a second person instance", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        FaceDetails: [
          {
            Confidence: 98,
            Quality: { Brightness: 70, Sharpness: 80 },
            Pose: { Yaw: 5, Pitch: -3 },
            FaceOccluded: { Value: false },
          },
        ],
      })
      .mockResolvedValueOnce({
        Labels: [{ Name: "Person", Instances: [{}, {}] }],
      });
    const facts = await detectFaceFacts(new Uint8Array([1]), { send });
    expect(facts.faceCount).toBe(1);
    expect(facts.personCount).toBe(2);
    expect(facts.confidence).toBe(98);
    expect(facts.occluded).toBe(false);
    expect(facts.yaw).toBe(5);
  });

  it("returns zeros when AWS finds nothing", async () => {
    const send = vi.fn().mockResolvedValue({});
    const facts = await detectFaceFacts(new Uint8Array([1]), { send });
    expect(facts.faceCount).toBe(0);
    expect(facts.personCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huggies-rekognition.test.ts`

Expected: FAIL with cannot find module `@/lib/huggies/rekognition`

- [ ] **Step 3: Write minimal implementation**

Run: `npm install @aws-sdk/client-rekognition`

`lib/huggies/rekognition.ts`:

```ts
import {
  DetectFacesCommand,
  DetectLabelsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import type { FaceFacts } from "@/lib/huggies/types";

type Sender = { send: (cmd: unknown) => Promise<unknown> };

export function defaultRekognitionClient(): Sender {
  return new RekognitionClient({ region: process.env.AWS_REGION });
}

export async function detectFaceFacts(
  bytes: Uint8Array,
  client: Sender = defaultRekognitionClient(),
): Promise<FaceFacts> {
  const faces = (await client.send(
    new DetectFacesCommand({ Image: { Bytes: bytes }, Attributes: ["ALL"] }),
  )) as {
    FaceDetails?: Array<{
      Confidence?: number;
      Quality?: { Brightness?: number; Sharpness?: number };
      Pose?: { Yaw?: number; Pitch?: number };
      FaceOccluded?: { Value?: boolean };
    }>;
  };
  const labels = (await client.send(
    new DetectLabelsCommand({ Image: { Bytes: bytes }, MaxLabels: 20 }),
  )) as { Labels?: Array<{ Name?: string; Instances?: unknown[] }> };
  const details = faces.FaceDetails ?? [];
  const face = details[0];
  const person = (labels.Labels ?? []).find((label) => label.Name === "Person");
  const personCount = person
    ? person.Instances?.length
      ? person.Instances.length
      : 1
    : details.length;
  return {
    faceCount: details.length,
    personCount,
    confidence: face?.Confidence ?? 0,
    brightness: face?.Quality?.Brightness ?? 0,
    sharpness: face?.Quality?.Sharpness ?? 0,
    yaw: face?.Pose?.Yaw ?? 0,
    pitch: face?.Pose?.Pitch ?? 0,
    occluded: Boolean(face?.FaceOccluded?.Value),
    minEdge: 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/huggies-rekognition.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/huggies/rekognition.ts tests/huggies-rekognition.test.ts
git commit -m "$(cat <<'EOF'
feat: map Rekognition face and person counts

EOF
)"
```

---

### Task 7: Huggies HTTP API

**Files:**
- Create: `lib/huggies/store.ts`
- Create: `lib/huggies/env.ts`
- Create: `app/api/huggies/session/route.ts`
- Create: `app/api/huggies/message/route.ts`
- Create: `app/api/huggies/job/route.ts`
- Create: `tests/huggies-api.test.ts`

**Interfaces:**
- Consumes: `hasDemoCookie`, `freshSession`, `applyTurn`, `settle`, `MachineDeps`, `judgeFace`, `imageMinEdge`, `QC_THRESHOLDS`, `extractFields`, `detectFaceFacts`, `getLlmProvider`
- Produces:
  - `resetHuggiesStore(): void`
  - `createHuggiesSession(session: Session): void`
  - `getHuggiesSession(id: string): Session | undefined`
  - `saveHuggiesSession(session: Session): void`
  - `videoUrlsFromEnv(): string[]` split on commas, trim, drop empties
  - `huggiesDeps(extract?: MachineDeps["extract"]): MachineDeps` reading env
  - `POST /api/huggies/session` `{ scenario, ai }` → `{ sessionId, step, messages, buttons }`
  - `POST /api/huggies/message` `{ sessionId, type, text, buttonId, imageBase64, mime }`
  - `GET /api/huggies/job?sessionId=` → `{ step, messages, buttons, jobId, job }`
  - Missing huggies cookie: `401`. Unknown session: `404`.

Route photo path, in order, then discard the buffer:

1. Decode base64. If `mime` is not `image/jpeg` or `image/png`, call `applyTurn` with `{ ok: false, reason: "bad_type" }`.
2. If `byteLength > QC_THRESHOLDS.maxBytes`, qc `{ ok: false, reason: "too_large" }`.
3. `imageMinEdge` null → `{ ok: false, reason: "low_res" }`.
4. Else `try detectFaceFacts`. On throw, qc `{ awsError: true }`. On success, `judgeFace({ ...facts, minEdge })`.
5. Do not pass bytes or base64 into `extractFields`.

`POST /session` stores a `freshSession` with `crypto.randomUUID()`, scenario default `success`, `ai` default `true`, terms from `HUGGIES_TERMS_VERSION`. Response messages come from `applyTurn` of an empty open: call `promptFor` via a zero-input by returning the welcome prompt from `freshSession` through `applyTurn` is wrong. Return `promptFor(session)` directly for the create response.

`GET /job` calls `settle`, saves, and returns messages only when `job.announced` was false and the step left `processing`. Then set `announced` true. While still processing, `messages` is `[]`.

`buttonId: "replay"` creates a new session with the same scenario and `ai`, saves it, and returns that new id plus the welcome prompt.

Wire `extract` only when `session.ai` is true, as `(step, text) => extractFields(getLlmProvider(), step, text)`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/huggies/rekognition", () => ({
  detectFaceFacts: vi.fn(async () => ({
    faceCount: 1,
    personCount: 1,
    confidence: 99,
    brightness: 80,
    sharpness: 80,
    yaw: 0,
    pitch: 0,
    occluded: false,
    minEdge: 0,
  })),
}));

vi.mock("@/lib/huggies/ai", () => ({
  extractFields: vi.fn(async () => {
    throw new Error("bad json");
  }),
}));

import { POST as createSession } from "@/app/api/huggies/session/route";
import { POST as postMessage } from "@/app/api/huggies/message/route";
import { GET as getJob } from "@/app/api/huggies/job/route";
import { resetHuggiesStore } from "@/lib/huggies/store";

function authed(url: string, body?: unknown) {
  return new Request(url, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      cookie: "vi_demo_huggies=1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("huggies API", () => {
  beforeEach(() => {
    resetHuggiesStore();
    process.env.HUGGIES_DELAY_MS = "0";
    process.env.HUGGIES_VIDEO_URLS = "https://s3.example/a.mp4";
    process.env.HUGGIES_TERMS_VERSION = "huggies-video-2026-11";
  });

  it("rejects a missing cookie", async () => {
    const res = await createSession(
      new Request("http://localhost/api/huggies/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "success", ai: false }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns a video url once for success", async () => {
    const created = await createSession(
      authed("http://localhost/api/huggies/session", { scenario: "success", ai: false }),
    );
    const start = await created.json();
    let sessionId = start.sessionId as string;
    for (const text of ["1", "1", "Bin", "Bin", "1", "2", "1"]) {
      const res = await postMessage(
        authed("http://localhost/api/huggies/message", {
          sessionId,
          type: "text",
          text,
        }),
      );
      expect(res.status).toBe(200);
    }
    const png = Buffer.alloc(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    png.writeUInt32BE(400, 16);
    png.writeUInt32BE(400, 20);
    const photo = await postMessage(
      authed("http://localhost/api/huggies/message", {
        sessionId,
        type: "image",
        mime: "image/png",
        imageBase64: png.toString("base64"),
      }),
    );
    expect((await photo.json()).step).toBe("confirm");
    const confirmed = await postMessage(
      authed("http://localhost/api/huggies/message", {
        sessionId,
        type: "text",
        text: "1",
      }),
    );
    const body = await confirmed.json();
    expect(body.jobId).toBeTruthy();
    const job = await getJob(
      authed(`http://localhost/api/huggies/job?sessionId=${sessionId}`),
    );
    const done = await job.json();
    expect(done.step).toBe("result");
    expect(done.job.videoUrl).toBe("https://s3.example/a.mp4");
    const again = await getJob(
      authed(`http://localhost/api/huggies/job?sessionId=${sessionId}`),
    );
    const second = await again.json();
    expect(second.job.videoUrl).toBe(done.job.videoUrl);
    expect(second.messages).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huggies-api.test.ts`

Expected: FAIL with cannot find module `@/app/api/huggies/session/route`

- [ ] **Step 3: Write minimal implementation**

`lib/huggies/store.ts`:

```ts
import type { Session } from "@/lib/huggies/types";

const sessions = new Map<string, Session>();

export function resetHuggiesStore(): void {
  sessions.clear();
}

export function createHuggiesSession(session: Session): void {
  sessions.set(session.id, session);
}

export function getHuggiesSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function saveHuggiesSession(session: Session): void {
  sessions.set(session.id, session);
}
```

`lib/huggies/env.ts`:

```ts
import { getLlmProvider } from "@/lib/llm";
import { extractFields } from "@/lib/huggies/ai";
import type { MachineDeps } from "@/lib/huggies/machine";
import type { StepId } from "@/lib/huggies/types";

export function videoUrlsFromEnv(): string[] {
  return (process.env.HUGGIES_VIDEO_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export function huggiesDeps(ai: boolean): MachineDeps {
  return {
    now: () => Date.now(),
    delayMs: Number(process.env.HUGGIES_DELAY_MS ?? 3000),
    newJobId: () => "job_" + crypto.randomUUID(),
    videoUrls: videoUrlsFromEnv(),
    pickVideo: (urls) => urls[Math.floor(Math.random() * urls.length)] ?? "",
    previewUrl: process.env.HUGGIES_PREVIEW_URL || null,
    learnMoreUrl: process.env.HUGGIES_LEARN_MORE_URL || "#",
    termsUrl: process.env.HUGGIES_TERMS_URL || "#",
    extract: ai
      ? (step: StepId, text: string) => extractFields(getLlmProvider(), step, text)
      : undefined,
  };
}
```

`app/api/huggies/session/route.ts`:

```ts
import { hasDemoCookie } from "@/lib/demo-access";
import { promptFor } from "@/lib/huggies/copy";
import { freshSession } from "@/lib/huggies/machine";
import { createHuggiesSession } from "@/lib/huggies/store";
import type { Scenario } from "@/lib/huggies/types";

export async function POST(req: Request) {
  if (!hasDemoCookie(req, "huggies")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { scenario?: Scenario; ai?: boolean };
  const scenario = body.scenario ?? "success";
  const session = freshSession({
    id: crypto.randomUUID(),
    scenario,
    ai: body.ai !== false,
    termsVersion: process.env.HUGGIES_TERMS_VERSION ?? "huggies-video-2026-11",
  });
  createHuggiesSession(session);
  const prompt = promptFor(session);
  return Response.json({
    sessionId: session.id,
    step: session.step,
    messages: [prompt.text],
    buttons: prompt.buttons,
  });
}
```

`app/api/huggies/message/route.ts` decodes the image, judges it, then calls `applyTurn`. Drop the buffer after `detectFaceFacts` by not storing it on the session. Response JSON is `{ step, messages, buttons, jobId, restart, sessionId }`. On `restart`, create a new `freshSession` with the same scenario and `ai`, save it, and return that id with the welcome prompt.

Photo order inside the handler:

```ts
import { hasDemoCookie } from "@/lib/demo-access";
import { promptFor } from "@/lib/huggies/copy";
import { imageMinEdge } from "@/lib/huggies/image";
import { applyTurn, freshSession } from "@/lib/huggies/machine";
import { huggiesDeps } from "@/lib/huggies/env";
import { judgeFace, QC_THRESHOLDS } from "@/lib/huggies/qc";
import { detectFaceFacts } from "@/lib/huggies/rekognition";
import { getHuggiesSession, saveHuggiesSession, createHuggiesSession } from "@/lib/huggies/store";
import type { QcOutcome, TurnInput } from "@/lib/huggies/types";

export async function POST(req: Request) {
  if (!hasDemoCookie(req, "huggies")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    sessionId?: string;
    type?: TurnInput["type"];
    text?: string;
    buttonId?: string;
    imageBase64?: string;
    mime?: string;
  };
  const current = body.sessionId ? getHuggiesSession(body.sessionId) : undefined;
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });

  let qc: QcOutcome | undefined;
  if (body.type === "image") {
    const mime = body.mime ?? "";
    if (mime !== "image/jpeg" && mime !== "image/png") {
      qc = { ok: false, reason: "bad_type" };
    } else {
      const bytes = Buffer.from(body.imageBase64 ?? "", "base64");
      if (bytes.byteLength > QC_THRESHOLDS.maxBytes) qc = { ok: false, reason: "too_large" };
      else {
        const minEdge = imageMinEdge(bytes);
        if (minEdge == null) qc = { ok: false, reason: "low_res" };
        else {
          try {
            const facts = await detectFaceFacts(bytes);
            qc = judgeFace({ ...facts, minEdge });
          } catch {
            qc = { awsError: true };
          }
        }
      }
    }
  }

  const result = await applyTurn(
    current,
    { type: body.type ?? "text", text: body.text, buttonId: body.buttonId, qc },
    huggiesDeps(current.ai),
  );

  if (result.restart) {
    const next = freshSession({
      id: crypto.randomUUID(),
      scenario: current.scenario,
      ai: current.ai,
      termsVersion: current.fields.termsVersion,
    });
    createHuggiesSession(next);
    const prompt = promptFor(next);
    return Response.json({
      sessionId: next.id,
      step: next.step,
      messages: [prompt.text],
      buttons: prompt.buttons,
      jobId: null,
      restart: true,
    });
  }

  saveHuggiesSession(result.session);
  return Response.json({
    sessionId: result.session.id,
    step: result.session.step,
    messages: result.messages,
    buttons: result.buttons,
    jobId: result.jobId,
    restart: false,
  });
}
```

`app/api/huggies/job/route.ts`:

```ts
import { hasDemoCookie } from "@/lib/demo-access";
import { huggiesDeps } from "@/lib/huggies/env";
import { settle } from "@/lib/huggies/machine";
import { getHuggiesSession, saveHuggiesSession } from "@/lib/huggies/store";

export async function GET(req: Request) {
  if (!hasDemoCookie(req, "huggies")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
  const current = getHuggiesSession(sessionId);
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });
  const wasProcessing = current.step === "processing";
  const result = settle(current, huggiesDeps(current.ai));
  const show = wasProcessing && result.session.step !== "processing";
  if (show && result.session.job) result.session.job.announced = true;
  saveHuggiesSession(result.session);
  return Response.json({
    step: result.session.step,
    messages: show ? result.messages : [],
    buttons: show ? result.buttons : [],
    jobId: result.jobId,
    job: result.session.job,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/huggies-api.test.ts tests/huggies-machine.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/store.ts lib/huggies/env.ts app/api/huggies tests/huggies-api.test.ts
git commit -m "$(cat <<'EOF'
feat: serve the Huggies pitch session API

EOF
)"
```

---

### Task 8: Huggies chat page

**Files:**
- Create: `app/huggies/page.tsx`
- Create: `app/huggies/HuggiesChat.tsx`
- Modify: `README.md`
- Test: manual checklist below, plus the existing suite

**Interfaces:**
- Consumes: `DemoGate`, cookie `vi_demo_huggies`, `POST /api/huggies/session`, `POST /api/huggies/message`, `GET /api/huggies/job`
- Produces: page `/huggies`

`app/huggies/page.tsx` is a server component with `dynamic = "force-dynamic"`. If the huggies cookie is not `1`, render `<DemoGate demo="huggies" />`. Otherwise render `<HuggiesChat />` inside `<main>`.

`HuggiesChat` is a client component. It reuses classes `chat-shell`, `chat-header`, `chat-thread`, `bubble`, `chat-composer`, `chat-error`.

Header controls: `<select>` scenario with options `success`, `error_photo_invalid`, `error_render`. `<select>` ai with `on` and `off`. Changing either value calls `POST /api/huggies/session` and replaces messages. That is the only place a session starts.

On mount, create the first session with `success` and `ai: "on"`.

Render assistant `messages` as bubbles. Render `buttons` under the latest assistant bubble. A button posts `{ type: "button", buttonId }`. The text form posts `{ type: "text", text }`. The file input `accept="image/jpeg,image/png"` reads the file with `FileReader.readAsDataURL`, strips the `data:...;base64,` prefix, and posts `{ type: "image", mime: file.type, imageBase64 }`. Show the local image with `URL.createObjectURL` in the user bubble. Do not put the base64 string into React state after the request settles; revoke the object URL when the bubble unmounts.

When a response has `step === "processing"` and `jobId`, poll `GET /api/huggies/job?sessionId=` every `500` ms until `step` is not `processing`. Append `messages` only when the array is non-empty. Stop polling on `result` or `error`. A result bubble also shows `<video controls src={job.videoUrl}>` when `videoUrl` is set, and `<img alt="" src={job.previewUrl}>` when `previewUrl` is set.

If `restart` is true, replace `sessionId` and messages with the response (welcome of the new session).

- [ ] **Step 1: Write the failing test**

There is no jsdom in `vitest.config.ts`. Add one contract test at `tests/huggies-page-contract.test.ts` that the server page module loads and the chat module exports the client entry:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("huggies page contract", () => {
  it("gates on the huggies cookie and posts to the huggies API", () => {
    const page = readFileSync("app/huggies/page.tsx", "utf8");
    const chat = readFileSync("app/huggies/HuggiesChat.tsx", "utf8");
    expect(page).toContain('demo="huggies"');
    expect(page).toContain("cookieName(\"huggies\")");
    expect(chat).toContain("/api/huggies/session");
    expect(chat).toContain("/api/huggies/message");
    expect(chat).toContain("/api/huggies/job");
    expect(chat).toContain("error_photo_invalid");
    expect(chat).toContain("error_render");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huggies-page-contract.test.ts`

Expected: FAIL because `app/huggies/page.tsx` does not exist

- [ ] **Step 3: Write minimal implementation**

`app/huggies/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { DemoGate } from "@/app/components/DemoGate";
import { HuggiesChat } from "@/app/huggies/HuggiesChat";
import { cookieName } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

export default async function HuggiesPage() {
  const jar = await cookies();
  if (jar.get(cookieName("huggies"))?.value !== "1") {
    return (
      <main>
        <DemoGate demo="huggies" />
      </main>
    );
  }
  return (
    <main>
      <HuggiesChat />
    </main>
  );
}
```

`app/huggies/HuggiesChat.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Btn = { id: string; label: string };
type Bubble = { role: "user" | "assistant"; text: string; imageUrl?: string };
type Job = { videoUrl?: string | null; previewUrl?: string | null };
type Scenario = "success" | "error_photo_invalid" | "error_render";

export function HuggiesChat() {
  const [scenario, setScenario] = useState<Scenario>("success");
  const [ai, setAi] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [text, setText] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  async function start(nextScenario: Scenario, nextAi: boolean) {
    const res = await fetch("/api/huggies/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: nextScenario, ai: nextAi }),
    });
    const data = await res.json();
    setSessionId(data.sessionId);
    setBubbles((data.messages as string[]).map((line) => ({ role: "assistant", text: line })));
    setButtons(data.buttons ?? []);
    setJob(null);
  }

  useEffect(() => {
    void start("success", true);
  }, []);

  function applyPayload(data: {
    sessionId: string;
    messages?: string[];
    buttons?: Btn[];
    step?: string;
    jobId?: string | null;
    job?: Job | null;
    restart?: boolean;
  }, user?: Bubble) {
    if (data.restart) {
      setSessionId(data.sessionId);
      setBubbles((data.messages ?? []).map((line) => ({ role: "assistant", text: line })));
      setButtons(data.buttons ?? []);
      setJob(null);
      return;
    }
    setSessionId(data.sessionId);
    setBubbles((prev) => [
      ...prev,
      ...(user ? [user] : []),
      ...(data.messages ?? []).map((line) => ({ role: "assistant" as const, text: line })),
    ]);
    setButtons(data.buttons ?? []);
    if (data.job) setJob(data.job);
    if (data.step === "processing" && data.jobId) void poll(data.sessionId);
  }

  async function poll(id: string) {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`/api/huggies/job?sessionId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if ((data.messages as string[] | undefined)?.length) {
        setBubbles((prev) => [
          ...prev,
          ...(data.messages as string[]).map((line) => ({ role: "assistant" as const, text: line })),
        ]);
        setButtons(data.buttons ?? []);
      }
      if (data.job) setJob(data.job);
      if (data.step !== "processing") return;
    }
  }

  async function send(body: Record<string, unknown>, user?: Bubble) {
    if (!sessionId) return;
    setError(null);
    const res = await fetch("/api/huggies/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, ...body }),
    });
    if (!res.ok) {
      setError("Không gửi được");
      return;
    }
    applyPayload(await res.json(), user);
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <strong>Huggies</strong>
        <select
          aria-label="scenario"
          value={scenario}
          onChange={(e) => {
            const value = e.target.value as Scenario;
            setScenario(value);
            void start(value, ai);
          }}
        >
          <option value="success">success</option>
          <option value="error_photo_invalid">error_photo_invalid</option>
          <option value="error_render">error_render</option>
        </select>
        <select
          aria-label="ai"
          value={ai ? "on" : "off"}
          onChange={(e) => {
            const next = e.target.value === "on";
            setAi(next);
            void start(scenario, next);
          }}
        >
          <option value="on">ai on</option>
          <option value="off">ai off</option>
        </select>
      </header>
      <div className="chat-thread">
        {bubbles.map((bubble, i) => (
          <div key={i} className={`bubble ${bubble.role}`}>
            {bubble.imageUrl ? <img alt="" src={bubble.imageUrl} /> : null}
            <p>{bubble.text}</p>
          </div>
        ))}
        {job?.previewUrl ? <img alt="" src={job.previewUrl} /> : null}
        {job?.videoUrl ? <video controls src={job.videoUrl} /> : null}
        <div>
          {buttons.map((button) => (
            <button key={button.id} type="button" onClick={() => void send({ type: "button", buttonId: button.id }, { role: "user", text: button.label })}>
              {button.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="chat-error">{error}</p> : null}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value) return;
          setText("");
          void send({ type: "text", text: value }, { role: "user", text: value });
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Tin nhắn" />
        <input
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Ảnh bé"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const imageUrl = URL.createObjectURL(file);
            urls.current.push(imageUrl);
            const reader = new FileReader();
            reader.onload = () => {
              const raw = String(reader.result ?? "");
              const imageBase64 = raw.slice(raw.indexOf(",") + 1);
              void send(
                { type: "image", mime: file.type, imageBase64 },
                { role: "user", text: "Ảnh", imageUrl },
              );
            };
            reader.readAsDataURL(file);
          }}
        />
        <button type="submit">Gửi</button>
      </form>
    </div>
  );
}
```

Add this section to `README.md`:

```md
## Huggies pitch

Open `/huggies`. Set `HUGGIES_ACCESS_CODE` and `HYUNDAI_ACCESS_CODE` (6 characters each). Set `HUGGIES_VIDEO_URLS` to a comma-separated list of S3 video URLs, plus `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` for photo checks. Hyundai chat behavior is unchanged aside from the access code on `/`.
```

- [ ] **Step 4: Run tests and the manual pitch checklist**

Run: `npx vitest run`

Expected: PASS

Manual, with env codes set and at least one public S3 mp4 in `HUGGIES_VIDEO_URLS`:

1. Open `/`. Wrong code stays on the form. Right code shows Minh. ManyChat callback still works without that cookie.
2. Open `/huggies`. Enter the Huggies code. Hyundai code does not open this page.
3. `ai=off`, scenario `success`: press buttons through confirm, upload a clear single-face JPG, wait about 3 seconds, see the same video URL after refresh of the result poll.
4. Switch scenario to `error_photo_invalid` (this starts a new chat). Upload a photo Rekognition would pass. See a failure reason. Repeat until the CS line. No video.
5. Switch to `error_render`. Finish confirm. See the error, retry twice, then no retry button.
6. Switch `ai` to `on` and send `bé tên Bin, con trai, thích xe` after consent. The next question is the display name, not gender.

- [ ] **Step 5: Commit**

```bash
git add app/huggies/page.tsx app/huggies/HuggiesChat.tsx tests/huggies-page-contract.test.ts README.md
git commit -m "$(cat <<'EOF'
feat: add the Huggies pitch chat page

EOF
)"
```

---

## Self-review

Spec coverage from `docs/huggies-demo-design.md`:

- Access cookies for both demos: Tasks 1–2 and 8.
- `/huggies` controls, new session on change: Task 8.
- Steps through result/error, buttons plus numbers, multi-field AI, fallback: Tasks 4–5 and 7.
- File picker, Rekognition, force-fail, 3-strike CS, AWS error does not count: Tasks 3, 4, 6, 7.
- One job, stable S3 URL, empty list, render retry cap 2: Task 4 and 7.
- Hyundai engine untouched except the cookie: Task 2.
- Vitest with injected QC and LLM: Tasks 3–7. Browser pass is the Task 8 checklist.

Placeholder scan: Tasks 1–7 include the test and the implementation that satisfies it. Task 8 names every request the page must send; the contract test checks those strings. No TBD.

Type names used in later tasks match Task 3: `Session`, `TurnInput`, `TurnResult`, `MachineDeps`, `QcOutcome`, `FaceFacts`, `judgeFace`, `imageMinEdge`, `extractFields`, `detectFaceFacts`.
