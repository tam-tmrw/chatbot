# Huggies Dual-Mode (Flow + AI Guide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pitch `/huggies` with Channel × Mode (`flow` | `guide`): keep the existing form machine for Flow, add a hybrid checklist agent for AI guide, hide scenario/AI-extract toggles, happy path only.

**Architecture:** Dual engine on one in-memory `Session`. `mode=flow` → `applyTurn` (light extract). `mode=guide` → `applyGuideTurn` (LLM JSON + validate/merge + exit/photo/confirm). Shared validate, QC, Rekognition, job settle. Web mock channels only; images never enter the LLM.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, existing `getLlmProvider()` / OpenAI, AWS Rekognition (soft-pass on auth fail).

**Spec:** `docs/superpowers/specs/2026-11-10-huggies-dual-mode-design.md`

## Global Constraints

- Default open: `mode=flow`, `channel=zalo`, `scenario=success` (forced).
- Guide LLM timeout ≈ **5000** ms (`HUGGIES_GUIDE_TIMEOUT_MS`).
- Vietnamese-only assistant replies; sanitize English crumbs.
- Exit intent in Guide → polite `end` (no drag-back).
- Guide photo = hard UI after text fields complete; reject early images.
- Do not wire Zalo OA / FB Send API; do not modify Hyundai `handleTurn`.
- Changing Channel/Mode creates a **new** session.
- After code changes: `graphify update .`

## File map

| File | Responsibility |
|------|----------------|
| `lib/huggies/types.ts` | Add `DemoMode`, `GuideMessage`, `GuideAction`, `mode` + `guideHistory` on Session; keep `ai` derived or remove from API |
| `lib/huggies/checklist.ts` | Shared missing-field helpers for Flow + Guide |
| `lib/huggies/agent.ts` | `applyGuideTurn`, guide LLM call, merge, exit, photo gate |
| `lib/huggies/machine.ts` | `freshSession({ mode })`; export `startVideoJob`; Flow extract when `mode==="flow"` |
| `lib/huggies/env.ts` | `huggiesDeps(session)` / deps from mode; guide timeout env |
| `app/api/huggies/session/route.ts` | Accept `mode`+`channel`; force `success`; drop pitch `ai`/`scenario` body |
| `app/api/huggies/message/route.ts` | Branch `flow` vs `guide` |
| `app/huggies/HuggiesChat.tsx` | Config: Channel + Mode; hide Scenario/AI extract; Guide photo UI |
| `tests/huggies-checklist.test.ts` | Checklist unit tests |
| `tests/huggies-agent.test.ts` | Guide turn tests (mocked LLM) |
| `tests/huggies-api.test.ts` | Session mode + guide routing |
| `tests/huggies-machine.test.ts` | Update `freshSession` / `ai` → `mode` |
| `.env.example` | `HUGGIES_GUIDE_TIMEOUT_MS=5000` |

---

### Task 1: Types + checklist helpers + freshSession(mode)

**Files:**
- Create: `lib/huggies/checklist.ts`
- Create: `tests/huggies-checklist.test.ts`
- Modify: `lib/huggies/types.ts`
- Modify: `lib/huggies/machine.ts` (`freshSession` signature)
- Modify: `tests/huggies-machine.test.ts` (all `freshSession({ ai: ...})` → `mode`)

**Interfaces:**
- Consumes: existing `Fields`, `StepId`, `Session`
- Produces:
  - `export type DemoMode = "flow" | "guide"`
  - `export type GuideMessage = { role: "user" | "assistant"; content: string }`
  - `Session.mode: DemoMode`
  - `Session.guideHistory: GuideMessage[]`
  - `Session.ai` kept as `boolean` derived: `mode === "flow"` (Flow light extract on; Guide false)
  - `export function missingTextKeys(fields: Fields): Array<"consent"|"babyName"|"displayName"|"gender"|"ageRange"|"hobby">`
  - `export function textFieldsComplete(fields: Fields): boolean`
  - `export function firstMissingHint(fields: Fields): string`
  - `freshSession(input: { id; scenario?; channel?; mode?; termsVersion })`

- [ ] **Step 1: Write the failing checklist test**

```ts
// tests/huggies-checklist.test.ts
import { describe, expect, it } from "vitest";
import {
  firstMissingHint,
  missingTextKeys,
  textFieldsComplete,
} from "@/lib/huggies/checklist";
import type { Fields } from "@/lib/huggies/types";

const empty = (): Fields => ({
  consent: false,
  consentAt: null,
  termsVersion: "t",
  babyName: null,
  displayName: null,
  gender: null,
  ageRange: null,
  hobby: null,
  photoOk: false,
});

describe("huggies checklist", () => {
  it("lists missing text keys in order and builds a VN hint", () => {
    const f = empty();
    expect(missingTextKeys(f)[0]).toBe("consent");
    expect(textFieldsComplete(f)).toBe(false);
    expect(firstMissingHint(f)).toMatch(/điều khoản|đồng ý/i);
    f.consent = true;
    f.babyName = "Tủn";
    expect(missingTextKeys(f)[0]).toBe("displayName");
    f.displayName = "Tủn";
    f.gender = "boy";
    f.ageRange = "1-2";
    f.hobby = "cars";
    expect(textFieldsComplete(f)).toBe(true);
    expect(missingTextKeys(f)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huggies-checklist.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement checklist + types + freshSession**

`lib/huggies/checklist.ts`:

```ts
import type { Fields } from "@/lib/huggies/types";

export type TextFieldKey =
  | "consent"
  | "babyName"
  | "displayName"
  | "gender"
  | "ageRange"
  | "hobby";

const ORDER: TextFieldKey[] = [
  "consent",
  "babyName",
  "displayName",
  "gender",
  "ageRange",
  "hobby",
];

const HINTS: Record<TextFieldKey, string> = {
  consent: "Ba mẹ đồng ý Điều khoản giúp mình để bắt đầu nhé (trả lời “đồng ý”).",
  babyName: "Bé nhà mình tên gì ạ? Ví dụ: Bin, Minh Anh.",
  displayName:
    "Tên trên video tối đa 12 ký tự, viết liền. Ví dụ: Bin, MinhAnh — hoặc nói “giữ tên này”.",
  gender: "Bé là bé trai, bé gái, hay không nêu ạ?",
  ageRange: "Bé đang ở độ tuổi nào ạ? (dưới 1 / 1–2 / 2–3 / trên 3)",
  hobby: "Bé thích gì nhất ạ? (xe hơi, động vật, âm nhạc, …)",
};

export function missingTextKeys(fields: Fields): TextFieldKey[] {
  const missing: TextFieldKey[] = [];
  if (!fields.consent) missing.push("consent");
  if (!fields.babyName) missing.push("babyName");
  if (!fields.displayName) missing.push("displayName");
  if (!fields.gender) missing.push("gender");
  if (!fields.ageRange) missing.push("ageRange");
  if (!fields.hobby) missing.push("hobby");
  return missing;
}

export function textFieldsComplete(fields: Fields): boolean {
  return missingTextKeys(fields).length === 0;
}

export function firstMissingHint(fields: Fields): string {
  const key = missingTextKeys(fields)[0];
  return key ? HINTS[key] : "Ba mẹ xác nhận tạo video giúp mình nhé.";
}
```

In `types.ts` add:

```ts
export type DemoMode = "flow" | "guide";
export type GuideMessage = { role: "user" | "assistant"; content: string };

// Session:
mode: DemoMode;
guideHistory: GuideMessage[];
ai: boolean; // derived: true iff mode === "flow"
```

`freshSession`:

```ts
export function freshSession(input: {
  id: string;
  scenario?: Scenario;
  channel?: DemoChannel;
  mode?: DemoMode;
  termsVersion: string;
}): Session {
  const mode = input.mode ?? "flow";
  return {
    id: input.id,
    scenario: input.scenario ?? "success",
    channel: input.channel ?? "zalo",
    mode,
    ai: mode === "flow",
    guideHistory: [],
    step: "welcome",
    fields: { /* unchanged */ },
    photoFails: 0,
    fakeReasonIndex: 0,
    editMenu: false,
    returnTo: null,
    job: null,
  };
}
```

Update machine `applyTurn` guard to use `session.mode === "flow" && session.ai && deps.extract` (same as today for flow).

Update every test `freshSession({ ai: true/false })` → `mode: "flow"` (and if a test needed ai off: keep `mode: "flow"` but pass deps without extract — or add optional `ai?: boolean` override only for tests; prefer `deps({ extract: undefined })` with `mode: "flow"` and force `session.ai = false` in those tests).

- [ ] **Step 4: Run checklist + machine tests**

Run: `npx vitest run tests/huggies-checklist.test.ts tests/huggies-machine.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/types.ts lib/huggies/checklist.ts lib/huggies/machine.ts tests/huggies-checklist.test.ts tests/huggies-machine.test.ts
git commit -m "feat(huggies): add DemoMode and shared text-field checklist"
```

---

### Task 2: Export startVideoJob + session API mode

**Files:**
- Modify: `lib/huggies/machine.ts` (export job starter used by Guide)
- Modify: `app/api/huggies/session/route.ts`
- Modify: `tests/huggies-api.test.ts` (session returns mode; scenario forced)

**Interfaces:**
- Consumes: `freshSession`, `MachineDeps`
- Produces: `export function startVideoJob(session: Session, deps: MachineDeps): TurnResult` (move body of current `confirmJob`)

- [ ] **Step 1: Write/adjust API session test**

```ts
it("creates a flow session with forced success and mode", async () => {
  const res = await createSession(
    authed("http://localhost/api/huggies/session", {
      channel: "messenger",
      mode: "guide",
      scenario: "error_render", // ignored
      ai: false, // ignored
    }),
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.mode).toBe("guide");
  expect(body.channel).toBe("messenger");
  // reopen session from store via a message 404-safe: just check shape
  expect(body.sessionId).toBeTruthy();
  expect(body.step).toBe("welcome");
});
```

- [ ] **Step 2: Run test — expect FAIL** on `body.mode`

- [ ] **Step 3: Implement session route + export startVideoJob**

Rename/export existing `confirmJob` as `startVideoJob` and keep internal alias:

```ts
export function startVideoJob(session: Session, deps: MachineDeps): TurnResult {
  // existing confirmJob body
}
function confirmJob(...) { return startVideoJob(...); }
```

`session/route.ts`:

```ts
const body = (await req.json()) as {
  channel?: DemoChannel;
  mode?: DemoMode;
};
const channel = body.channel === "messenger" ? "messenger" : "zalo";
const mode = body.mode === "guide" ? "guide" : "flow";
const session = freshSession({
  id: crypto.randomUUID(),
  scenario: "success",
  channel,
  mode,
  termsVersion: process.env.HUGGIES_TERMS_VERSION ?? "huggies-video-2026-11",
});
// for guide welcome: still promptFor welcome; guide will take over on first user text
return Response.json({
  sessionId: session.id,
  step: session.step,
  channel: session.channel,
  mode: session.mode,
  messages: [promptFor(session).text],
  buttons: promptFor(session).buttons,
});
```

Update API tests that still send `ai: false` — use `mode: "flow"` and mock extract as today; set `session.ai` behavior via mode.

- [ ] **Step 4: Run** `npx vitest run tests/huggies-api.test.ts` — PASS

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/machine.ts app/api/huggies/session/route.ts tests/huggies-api.test.ts
git commit -m "feat(huggies): session API accepts mode; export startVideoJob"
```

---

### Task 3: Guide agent (`applyGuideTurn`) — TDD

**Files:**
- Create: `lib/huggies/agent.ts`
- Create: `tests/huggies-agent.test.ts`
- Modify: `lib/huggies/env.ts` (optional guide timeout helper)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `checklist.*`, parsers/`isAffirmative`, `sanitizeReply`, `startVideoJob`, `MachineDeps`, `qcUserCopy`
- Produces:
  - `export type GuideLlmResult = { reply: string; fields?: Partial<...>; exit?: boolean; readyForPhoto?: boolean; confirm?: boolean }`
  - `export type GuideDeps = MachineDeps & { guideChat: (messages: {role;content}[]) => Promise<string>; guideTimeoutMs?: number }`
  - `export async function applyGuideTurn(session: Session, input: TurnInput, deps: GuideDeps): Promise<TurnResult>`

- [ ] **Step 1: Write failing agent tests**

```ts
// tests/huggies-agent.test.ts
import { describe, expect, it, vi } from "vitest";
import { applyGuideTurn } from "@/lib/huggies/agent";
import { freshSession } from "@/lib/huggies/machine";
import type { GuideDeps } from "@/lib/huggies/agent";
import type { MachineDeps } from "@/lib/huggies/machine";

function baseDeps(over: Partial<GuideDeps> = {}): GuideDeps {
  const machine: MachineDeps = {
    now: () => 1_700_000_000_000,
    delayMs: 0,
    newJobId: () => "job_1",
    videoUrls: ["https://s3.example/a.mp4"],
    pickVideo: (u) => u[0],
    previewUrl: null,
    learnMoreUrl: "#",
    termsUrl: "#",
  };
  return {
    ...machine,
    guideChat: vi.fn(async () =>
      JSON.stringify({
        reply: "Ok mình ghi nhận nhé!",
        fields: { consent: true, babyName: "Tủn", displayName: "Tủn", gender: "boy", ageRange: "1-2", hobby: "cars" },
        readyForPhoto: true,
      }),
    ),
    guideTimeoutMs: 5000,
    ...over,
  };
}

describe("applyGuideTurn", () => {
  it("merges fields and moves to photo when text-complete", async () => {
    const s = freshSession({ id: "g1", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(s, { type: "text", text: "đồng ý, bé Tủn, giữ tên, trai, 1-2 tuổi, thích xe" }, baseDeps());
    expect(out.session.fields.babyName).toBe("Tủn");
    expect(out.session.fields.photoOk).toBe(false);
    expect(out.session.step).toBe("photo");
    expect(out.messages.join(" ")).toMatch(/ảnh|Ok/i);
  });

  it("ends politely on exit", async () => {
    const s = freshSession({ id: "g2", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "không chơi nữa" },
      baseDeps({
        guideChat: vi.fn(async () =>
          JSON.stringify({ reply: "Cảm ơn ba mẹ, mình dừng tại đây nhé.", exit: true }),
        ),
      }),
    );
    expect(out.session.step).toBe("end");
    expect(out.messages.join(" ")).toMatch(/Cảm ơn|dừng/i);
  });

  it("rejects image before text fields are complete", async () => {
    const s = freshSession({ id: "g3", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(s, { type: "image", qc: { ok: true } }, baseDeps());
    expect(out.session.fields.photoOk).toBe(false);
    expect(out.session.step).not.toBe("confirm");
    expect(out.messages.join(" ")).toMatch(/thông tin|trước|ảnh/i);
  });

  it("falls back in VN when LLM times out", async () => {
    const s = freshSession({ id: "g4", mode: "guide", termsVersion: "t" });
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "hello" },
      baseDeps({
        guideTimeoutMs: 10,
        guideChat: () => new Promise((r) => setTimeout(() => r("{}"), 50)),
      }),
    );
    expect(out.messages.join(" ")).not.toMatch(/please|provide/i);
    expect(out.messages.join(" ")).toMatch(/điều khoản|đồng ý|Ba mẹ/i);
  });

  it("starts job on confirm after photoOk", async () => {
    let s = freshSession({ id: "g5", mode: "guide", termsVersion: "t" });
    s.fields = {
      consent: true,
      consentAt: "t",
      termsVersion: "t",
      babyName: "Tủn",
      displayName: "Tủn",
      gender: "boy",
      ageRange: "1-2",
      hobby: "cars",
      photoOk: true,
    };
    s.step = "confirm";
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "oke tạo đi" },
      baseDeps({
        guideChat: vi.fn(async () =>
          JSON.stringify({ reply: "Đang tạo video nhé!", confirm: true }),
        ),
      }),
    );
    expect(out.session.step).toBe("processing");
    expect(out.jobId).toBe("job_1");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/huggies-agent.test.ts` — FAIL module missing

- [ ] **Step 3: Implement `lib/huggies/agent.ts`**

Implement (complete file — engineer copies this structure):

```ts
import { foldVn } from "@/lib/conversation/flow";
import { sanitizeReply } from "@/lib/huggies/ai";
import {
  firstMissingHint,
  textFieldsComplete,
} from "@/lib/huggies/checklist";
import { qcUserCopy } from "@/lib/huggies/copy";
import { startVideoJob, type MachineDeps } from "@/lib/huggies/machine";
import type {
  AgeRange,
  Extracted,
  Fields,
  Gender,
  HobbyId,
  Session,
  TurnInput,
  TurnResult,
} from "@/lib/huggies/types";
import {
  HOBBIES,
  isAffirmative,
  parseAgeToken,
  parseBabyName,
  parseDisplayName,
  parseGenderToken,
  parseHobbyToken,
} from "@/lib/huggies/validate";

export type GuideLlmResult = {
  reply?: string | null;
  fields?: {
    consent?: boolean;
    babyName?: string | null;
    displayName?: string | null;
    gender?: Gender | null;
    ageRange?: AgeRange | null;
    hobby?: HobbyId | null;
  };
  exit?: boolean;
  readyForPhoto?: boolean;
  confirm?: boolean;
};

export type GuideDeps = MachineDeps & {
  guideChat: (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => Promise<string>;
  guideTimeoutMs?: number;
};

const HISTORY_MAX = 8;

function pushHistory(session: Session, role: "user" | "assistant", content: string) {
  session.guideHistory = [...session.guideHistory, { role, content }].slice(-HISTORY_MAX);
}

function looksLikeExit(text: string): boolean {
  const t = foldVn(text);
  return /(khong choi|thoi di|thoi nha|dung lai|ket thuc|stop|bye|exit)/.test(t);
}

function mergeGuideFields(session: Session, raw: GuideLlmResult["fields"], userText: string): void {
  if (!raw && !userText) return;
  const f = session.fields;
  if (raw?.consent === true || /dong y/.test(foldVn(userText))) {
    f.consent = true;
    f.consentAt = f.consentAt ?? new Date().toISOString();
  }
  if (typeof raw?.babyName === "string") {
    const n = parseBabyName(raw.babyName);
    if (n) f.babyName = n;
  }
  if (typeof raw?.displayName === "string") {
    const n = parseDisplayName(raw.displayName);
    if (n) f.displayName = n;
  } else if (f.babyName && isAffirmative(userText) && !f.displayName) {
    const n = parseDisplayName(f.babyName.replace(/\s+/g, "").slice(0, 12));
    if (n) f.displayName = n;
  }
  if (raw?.gender === "boy" || raw?.gender === "girl" || raw?.gender === "unspecified") {
    f.gender = raw.gender;
  }
  if (
    raw?.ageRange === "<1" ||
    raw?.ageRange === "1-2" ||
    raw?.ageRange === "2-3" ||
    raw?.ageRange === ">3"
  ) {
    f.ageRange = raw.ageRange;
  }
  if (typeof raw?.hobby === "string" && HOBBIES.some((h) => h.id === raw.hobby)) {
    f.hobby = raw.hobby as HobbyId;
  }
}

function systemPrompt(session: Session): string {
  return `Bạn là trợ lý Huggies (tiếng Việt, thân thiện). Thu thập: consent, babyName, displayName (≤12, không space), gender, ageRange, hobby rồi ảnh (UI riêng), rồi confirm tạo video.
Trả ĐÚNG một JSON: { "reply": string, "fields": {...}|{}, "exit": boolean, "readyForPhoto": boolean, "confirm": boolean }.
CẤM tiếng Anh trong reply. Không bịa field. Nếu user muốn dừng → exit=true.
Khi đủ field text → readyForPhoto=true. Khi đã có ảnh và user đồng ý tạo → confirm=true.
Fields hiện tại: ${JSON.stringify(session.fields)}
Missing hint: ${firstMissingHint(session.fields)}`;
}

async function callGuideLlm(session: Session, userText: string, deps: GuideDeps): Promise<GuideLlmResult> {
  const timeoutMs = deps.guideTimeoutMs ?? Number(process.env.HUGGIES_GUIDE_TIMEOUT_MS ?? 5000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM timeout")), timeoutMs);
  });
  try {
    const messages = [
      { role: "system" as const, content: systemPrompt(session) },
      ...session.guideHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: userText },
    ];
    const raw = await Promise.race([deps.guideChat(messages), timeout]);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("invalid json");
    return JSON.parse(raw.slice(start, end + 1)) as GuideLlmResult;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function viewGuide(session: Session, messages: string[], buttons: TurnResult["buttons"] = []): TurnResult {
  return {
    session,
    messages,
    buttons,
    jobId: session.job?.id ?? null,
    restart: false,
  };
}

export async function applyGuideTurn(
  inputSession: Session,
  input: TurnInput,
  deps: GuideDeps,
): Promise<TurnResult> {
  const session = structuredClone(inputSession);

  if (session.step === "processing") {
    return viewGuide(session, ["Video đang xử lý. Ba mẹ chờ mình một chút nhé!"]);
  }

  if (input.type === "image") {
    if (!textFieldsComplete(session.fields) || session.step !== "photo") {
      const msg = `Mình cần vài thông tin trước khi nhận ảnh ạ.\n${firstMissingHint(session.fields)}`;
      pushHistory(session, "assistant", msg);
      return viewGuide(session, [msg]);
    }
    if (!input.qc || "awsError" in input.qc) {
      return viewGuide(session, [
        "Mình chưa kiểm tra được ảnh (lỗi dịch vụ nhận diện). Ba mẹ gửi lại JPG/PNG giúp mình nhé.",
      ]);
    }
    if (!input.qc.ok) {
      session.photoFails += 1;
      const msg = `Ảnh chưa đạt (${qcUserCopy(input.qc.reason)}). Ba mẹ gửi ảnh khác giúp mình nhé.`;
      return viewGuide(session, [msg]);
    }
    session.fields.photoOk = true;
    session.step = "confirm";
    const msg =
      "Ảnh đẹp rồi ạ! Mình tóm tắt: " +
      `${session.fields.babyName} / ${session.fields.displayName}. Ba mẹ xác nhận tạo video nhé?`;
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  const userText = (input.text ?? "").trim() || (input.buttonId ?? "");
  if (!userText) return viewGuide(session, [firstMissingHint(session.fields)]);
  pushHistory(session, "user", userText);

  if (looksLikeExit(userText)) {
    session.step = "end";
    const msg = "Cảm ơn ba mẹ đã ghé. Khi nào muốn tạo video cho bé, nhắn mình lại nhé.";
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  if (session.step === "confirm" && session.fields.photoOk && isAffirmative(userText)) {
    return startVideoJob(session, deps);
  }

  let parsed: GuideLlmResult;
  try {
    parsed = await callGuideLlm(session, userText, deps);
  } catch {
    const msg = `Mình chưa nghe rõ ạ.\n${firstMissingHint(session.fields)}`;
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  if (parsed.exit || looksLikeExit(parsed.reply ?? "")) {
    session.step = "end";
    const msg =
      sanitizeReply(parsed.reply) ??
      "Cảm ơn ba mẹ đã ghé. Khi nào muốn tạo video cho bé, nhắn mình lại nhé.";
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  mergeGuideFields(session, parsed.fields, userText);

  if (parsed.confirm && session.fields.photoOk && textFieldsComplete(session.fields)) {
    return startVideoJob(session, deps);
  }

  if (textFieldsComplete(session.fields) && !session.fields.photoOk) {
    session.step = "photo";
    const reply =
      sanitizeReply(parsed.reply) ??
      "Thông tin đủ rồi ạ. Ba mẹ gửi 1 ảnh mặt bé rõ, nhìn thẳng, đủ sáng nhé.";
    pushHistory(session, "assistant", reply);
    return viewGuide(session, [reply]);
  }

  const reply =
    sanitizeReply(parsed.reply) ?? firstMissingHint(session.fields);
  const withHint =
    textFieldsComplete(session.fields)
      ? reply
      : reply.includes("?")
        ? reply
        : `${reply}\n${firstMissingHint(session.fields)}`;
  // sync step loosely to first missing for UI headers
  if (!session.fields.consent) session.step = "consent";
  else if (!session.fields.babyName) session.step = "baby_name";
  else if (!session.fields.displayName) session.step = "display_name";
  else if (!session.fields.gender) session.step = "gender";
  else if (!session.fields.ageRange) session.step = "age_range";
  else if (!session.fields.hobby) session.step = "hobby";
  pushHistory(session, "assistant", withHint);
  return viewGuide(session, [withHint]);
}
```

Add to `.env.example`:

```
HUGGIES_GUIDE_TIMEOUT_MS=5000
```

- [ ] **Step 4: Run** `npx vitest run tests/huggies-agent.test.ts` — PASS (tighten assertions if needed)

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/agent.ts tests/huggies-agent.test.ts .env.example
git commit -m "feat(huggies): add AI guide applyGuideTurn agent"
```

---

### Task 4: Wire message route + guideDeps

**Files:**
- Modify: `lib/huggies/env.ts`
- Modify: `app/api/huggies/message/route.ts`
- Modify: `tests/huggies-api.test.ts`

**Interfaces:**
- Consumes: `applyGuideTurn`, `getLlmProvider`, `applyTurn`
- Produces: `export function huggiesGuideDeps(): GuideDeps` and keep `huggiesDeps(ai: boolean)` for Flow

- [ ] **Step 1: Add API test — guide rejects early photo; flow still works**

```ts
it("routes guide mode and rejects early photo", async () => {
  const created = await createSession(
    authed("http://localhost/api/huggies/session", { mode: "guide", channel: "zalo" }),
  );
  const { sessionId } = await created.json();
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
  const body = await photo.json();
  expect(body.step).not.toBe("confirm");
  expect(body.messages.join(" ")).toMatch(/trước|thông tin|điều khoản/i);
});
```

Mock `@/lib/huggies/ai` stays; also mock guide path via env using real `applyGuideTurn` (no OpenAI if early photo — no LLM call).

- [ ] **Step 2: Run — FAIL until route branches**

- [ ] **Step 3: Implement env + message routing**

```ts
// env.ts
export function huggiesGuideDeps(): GuideDeps {
  const base = huggiesDeps(false);
  return {
    ...base,
    guideTimeoutMs: Number(process.env.HUGGIES_GUIDE_TIMEOUT_MS ?? 5000),
    guideChat: async (messages) => getLlmProvider().chat(messages as any),
  };
}
```

In `message/route.ts` after QC:

```ts
const result =
  current.mode === "guide"
    ? await applyGuideTurn(current, { type: body.type ?? "text", text: body.text, buttonId: body.buttonId, qc }, huggiesGuideDeps())
    : await applyTurn(current, { type: body.type ?? "text", text: body.text, buttonId: body.buttonId, qc }, huggiesDeps(current.ai));
```

Restart `freshSession` must pass `mode: current.mode`, `channel`, drop obsolete `ai:` arg (derived).

Return `mode: result.session.mode` in JSON for UI.

- [ ] **Step 4: Run** `npx vitest run tests/huggies-api.test.ts` — PASS (fix flow test bodies to `mode: "flow"`)

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/env.ts app/api/huggies/message/route.ts tests/huggies-api.test.ts
git commit -m "feat(huggies): route messages to flow machine or guide agent"
```

---

### Task 5: HuggiesChat UI — Channel × Mode, Guide photo

**Files:**
- Modify: `app/huggies/HuggiesChat.tsx`
- Optional CSS: only if Guide needs a small awaiting-photo note (prefer reuse dropzone)

**Interfaces:**
- Consumes: session API `{ channel, mode }`; message responses `{ step, mode, buttons, messages, job }`
- Produces: pitch panel without Scenario / AI extract; default Flow+Zalo

- [ ] **Step 1: Manual test plan (document in commit body) — no browser automation required**

Checklist:
1. Open `/huggies` → Flow + Zalo welcome with numbers  
2. Config → Mode AI guide + Messenger → new chat, free-text feel  
3. Guide: say “không chơi nữa” → polite end  
4. Guide: complete fields in chat → dropzone appears at photo  
5. Flow regression: số/nút still works  

- [ ] **Step 2: Implement UI changes**

Replace state:

```ts
type DemoMode = "flow" | "guide";
const [mode, setMode] = useState<DemoMode>("flow");
const [draftMode, setDraftMode] = useState<DemoMode>("flow");
// remove scenario/ai draft state from panel (keep const scenario = "success" internally)
```

`start(nextMode, nextChannel)`:

```ts
body: JSON.stringify({ mode: nextMode, channel: nextChannel })
```

`useEffect(() => { void start("flow", "zalo"); }, []);`

Config panel fieldsets: **Kênh demo**, **Mode** (`Flow chatbot` / `AI guide`). Remove Scenario + AI extract blocks.

Photo UI:

```ts
const showDropzone =
  (channel === "messenger" || mode === "guide") && step === "photo";
// Zalo+Flow: camera only; Zalo+Guide: also show dropzone OR keep camera — spec allows camera; show dropzone for guide on both channels for clarity
const showDropzone = step === "photo" && (channel === "messenger" || mode === "guide");
```

Header subtitle: show `Flow` vs `AI guide` + channel label.

Chips: Flow+messenger as today; Guide: hide choice grids unless buttons returned (usually empty).

- [ ] **Step 3: `npx tsc --noEmit`** — clean

- [ ] **Step 4: Commit**

```bash
git add app/huggies/HuggiesChat.tsx
git commit -m "feat(huggies): pitch config Channel x Mode; guide photo UI"
```

---

### Task 6: Full regression + graphify + pitch smoke notes

**Files:**
- Modify: any leftover `ai:` in tests/docs references under `tests/` and `.env.example`
- Run graphify

- [ ] **Step 1: Run full Huggies test suite**

```bash
npx vitest run tests/huggies-*.test.ts
npx tsc --noEmit
```

Expected: all PASS

- [ ] **Step 2: `graphify update .`**

- [ ] **Step 3: Update spec status line** in `docs/superpowers/specs/2026-11-10-huggies-dual-mode-design.md` to `Status: Implementation planned` (optional) — or leave as validated.

- [ ] **Step 4: Commit** if any fixups

```bash
git add -A
git commit -m "test(huggies): dual-mode regression green"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Channel × Mode config; hide scenario/AI extract | T2, T5 |
| Default Flow + Zalo; scenario forced success | T1, T2, T5 |
| Flow = machine + light extract | T1 (ai derived), T4 |
| Guide hybrid checklist agent | T3 |
| Guide timeout ~5s + VN fallback | T3 |
| Exit → polite end | T3 |
| Photo hard UI after text; reject early image | T3, T4, T5 |
| Shared job/video settle | T3 uses `startVideoJob`; existing job route |
| No live OA/FB; no Hyundai engine; no image-in-LLM | Global + T3 prompt |
| Vitest agent/API/Flow regression | T1–T4, T6 |

## Placeholder scan

No TBD / “implement later” steps; code blocks included for core modules.

## Type consistency

- `DemoMode`, `GuideDeps`, `applyGuideTurn`, `startVideoJob`, `freshSession({ mode })` used consistently across tasks.
- `Session.ai` = `mode === "flow"` only.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-11-10-huggies-dual-mode.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  

**2. Inline Execution** — execute tasks in this session with checkpoints  

**Which approach?**
