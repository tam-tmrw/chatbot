# Huggies Guide Hard Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide mode always surfaces terms URL from `HUGGIES_TERMS_URL`, answers terms questions without skipping fields, uses free-text welcome, full hobby list, and Flow-parity confirm summary.

**Architecture:** Pure copy helpers in `checklist.ts` (`consentPrompt`, `firstMissingHint` with `termsUrl`, hobby enum text, `confirmSummary`). `applyGuideTurn` short-circuits terms inquiries before the LLM. `promptFor` branches Guide welcome. No new env keys — reuse `deps.termsUrl`.

**Tech Stack:** Next.js 15, TypeScript, Vitest, existing `lib/huggies/*`.

## Global Constraints

- Terms URL source: `deps.termsUrl` ← `HUGGIES_TERMS_URL` (same as Flow); default `#` if unset.
- Consent prompt must include purpose line + `Điều khoản: ${url}` + “đồng ý” CTA.
- Terms inquiry while `!consent` → re-send consent prompt only; **no LLM**; do not advance fields.
- Guide welcome: no “gõ số” / numbered start; Flow welcome unchanged.
- Hobby hint: all `HOBBIES[].label`, comma-separated, no ellipsis.
- Confirm: babyName, displayName, gender, ageRange, hobby label, photo — then ask confirm.
- Do not change Flow `applyRigid` consent path.
- After code changes: `graphify update .`
- Vietnamese assistant copy only.

## File map

| File | Responsibility |
|------|----------------|
| `lib/huggies/checklist.ts` | `consentPrompt`, `looksLikeTermsAsk`, `firstMissingHint(fields, opts)`, hobby + confirm helpers |
| `lib/huggies/agent.ts` | Terms short-circuit; pass `deps.termsUrl` into hints; use `confirmSummary` after photo |
| `lib/huggies/copy.ts` | Guide-specific `welcome` when `session.mode === "guide"` |
| `tests/huggies-checklist.test.ts` | Unit tests for helpers |
| `tests/huggies-agent.test.ts` | Terms ask + confirm summary + consent URL in fallback |
| `tests/huggies-machine.test.ts` or small copy test | Guide welcome text |
| `.env.example` | Comment that Guide uses `HUGGIES_TERMS_URL` |

---

### Task 1: Checklist hard-info helpers

**Files:**
- Modify: `lib/huggies/checklist.ts`
- Modify: `tests/huggies-checklist.test.ts`
- Modify: `.env.example` (one-line comment only)

**Interfaces:**
- Consumes: `Fields` from types; `HOBBIES` from `lib/huggies/validate`
- Produces:
  - `consentPrompt(termsUrl: string): string`
  - `looksLikeTermsAsk(text: string): boolean`
  - `firstMissingHint(fields: Fields, opts?: { termsUrl?: string }): string`
  - `confirmSummary(fields: Fields): string`

- [ ] **Step 1: Write the failing tests**

Replace/extend `tests/huggies-checklist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  confirmSummary,
  consentPrompt,
  firstMissingHint,
  looksLikeTermsAsk,
  missingTextKeys,
  textFieldsComplete,
} from "@/lib/huggies/checklist";
import { HOBBIES } from "@/lib/huggies/validate";
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
    expect(firstMissingHint(f, { termsUrl: "https://terms.example" })).toContain(
      "https://terms.example",
    );
    expect(firstMissingHint(f, { termsUrl: "https://terms.example" })).toMatch(/đồng ý/i);
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

  it("consentPrompt always includes purpose, url, and CTA", () => {
    const p = consentPrompt("https://terms.example/tc");
    expect(p).toMatch(/ảnh|video/i);
    expect(p).toContain("Điều khoản: https://terms.example/tc");
    expect(p).toMatch(/đồng ý/i);
  });

  it("detects terms questions without treating đồng ý as ask", () => {
    expect(looksLikeTermsAsk("điều khoản gì vậy")).toBe(true);
    expect(looksLikeTermsAsk("cho xem link điều khoản")).toBe(true);
    expect(looksLikeTermsAsk("đồng ý")).toBe(false);
    expect(looksLikeTermsAsk("ok")).toBe(false);
  });

  it("hobby hint lists every HOBBIES label", () => {
    const f = empty();
    f.consent = true;
    f.babyName = "Tủn";
    f.displayName = "Tun";
    f.gender = "boy";
    f.ageRange = "1-2";
    const hint = firstMissingHint(f);
    for (const h of HOBBIES) {
      expect(hint).toContain(h.label);
    }
    expect(hint).not.toMatch(/…|\.\.\./);
  });

  it("confirmSummary lists all collected fields", () => {
    const f = empty();
    f.consent = true;
    f.babyName = "Tủn";
    f.displayName = "Tun";
    f.gender = "boy";
    f.ageRange = "1-2";
    f.hobby = "cars";
    f.photoOk = true;
    const s = confirmSummary(f);
    expect(s).toMatch(/Tủn/);
    expect(s).toMatch(/Tun/);
    expect(s).toMatch(/trai|Bé trai/i);
    expect(s).toMatch(/1–2|1-2/);
    expect(s).toMatch(/Xe hơi/);
    expect(s).toMatch(/Ảnh|ảnh/);
    expect(s).toMatch(/xác nhận|tạo video/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huggies-checklist.test.ts`

Expected: FAIL — `consentPrompt` / `looksLikeTermsAsk` / `confirmSummary` not exported; hobby still has ellipsis; consent hint lacks URL.

- [ ] **Step 3: Implement helpers in `lib/huggies/checklist.ts`**

```ts
import { foldVn } from "@/lib/conversation/flow";
import type { Fields } from "@/lib/huggies/types";
import { HOBBIES } from "@/lib/huggies/validate";

export type TextFieldKey =
  | "consent"
  | "babyName"
  | "displayName"
  | "gender"
  | "ageRange"
  | "hobby";

const GENDER_LABEL = { boy: "Bé trai", girl: "Bé gái", unspecified: "Không nêu" } as const;
const AGE_LABEL = {
  "<1": "Dưới 1 tuổi",
  "1-2": "1–2 tuổi",
  "2-3": "2–3 tuổi",
  ">3": "Trên 3 tuổi",
} as const;

export function consentPrompt(termsUrl: string): string {
  const url = termsUrl.trim() || "#";
  return [
    "Trước khi bắt đầu, mình cần ba mẹ đồng ý Điều khoản sử dụng ảnh để tạo video (ảnh chỉ dùng cho mục đích này).",
    `Điều khoản: ${url}`,
    "Ba mẹ trả lời “đồng ý” để tiếp tục, hoặc “không đồng ý” nếu muốn dừng nhé.",
  ].join("\n");
}

export function looksLikeTermsAsk(text: string): boolean {
  const t = foldVn(text);
  if (/\b(dong y|khong dong y)\b/.test(t) && !/dieu khoan|link|url|xem/.test(t)) {
    return false;
  }
  return /dieu khoan|link dieu khoan|xem dieu khoan|\blink\b|\burl\b|cho xem/.test(t);
}

function hobbyHint(): string {
  const labels = HOBBIES.map((h) => h.label).join(", ");
  return `Bé thích gì nhất ạ? Chọn một trong: ${labels}.`;
}

export function confirmSummary(fields: Fields): string {
  const hobby = HOBBIES.find((h) => h.id === fields.hobby)?.label ?? "";
  return [
    "Mình tóm tắt lại cho ba mẹ kiểm tra nhé:",
    `Tên: ${fields.babyName ?? ""}`,
    `Tên trên video: ${fields.displayName ?? ""}`,
    `Giới tính: ${fields.gender ? GENDER_LABEL[fields.gender] : ""}`,
    `Độ tuổi: ${fields.ageRange ? AGE_LABEL[fields.ageRange] : ""}`,
    `Sở thích: ${hobby}`,
    `Ảnh: ${fields.photoOk ? "đã nhận" : "chưa có"}`,
    "",
    "Ba mẹ xác nhận tạo video giúp mình nhé?",
  ].join("\n");
}

const HINTS: Record<Exclude<TextFieldKey, "consent" | "hobby">, string> = {
  babyName: "Bé nhà mình tên gì ạ? Ví dụ: Bin, Minh Anh.",
  displayName:
    "Tên trên video tối đa 12 ký tự, viết liền. Ví dụ: Bin, MinhAnh — hoặc nói “giữ tên này”.",
  gender: "Bé là bé trai, bé gái, hay không nêu ạ?",
  ageRange: "Bé đang ở độ tuổi nào ạ? (dưới 1 / 1–2 / 2–3 / trên 3)",
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

export function firstMissingHint(
  fields: Fields,
  opts?: { termsUrl?: string },
): string {
  const key = missingTextKeys(fields)[0];
  if (!key) return confirmSummary(fields);
  if (key === "consent") return consentPrompt(opts?.termsUrl ?? "#");
  if (key === "hobby") return hobbyHint();
  return HINTS[key];
}
```

In `.env.example`, keep `HUGGIES_TERMS_URL=#` and add comment:

```bash
# Shared by Flow + Guide consent (Guide always shows this URL in chat)
HUGGIES_TERMS_URL=#
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/huggies-checklist.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/huggies/checklist.ts tests/huggies-checklist.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat(huggies): guide checklist consent URL, hobby list, confirm summary

EOF
)"
```

---

### Task 2: Wire Guide agent + welcome copy

**Files:**
- Modify: `lib/huggies/agent.ts`
- Modify: `lib/huggies/copy.ts` (`promptFor` welcome branch)
- Modify: `tests/huggies-agent.test.ts`
- Test: add/extend test for Guide welcome in `tests/huggies-machine.test.ts` or new assertion in existing page/api test

**Interfaces:**
- Consumes: `consentPrompt`, `looksLikeTermsAsk`, `firstMissingHint`, `confirmSummary` from Task 1; `deps.termsUrl`
- Produces: Guide behavior matching spec success criteria

- [ ] **Step 1: Write the failing agent tests**

Add to `tests/huggies-agent.test.ts`:

```ts
  it("answers terms questions with URL and stays on consent", async () => {
    const s = freshSession({ id: "g-terms", mode: "guide", termsVersion: "t" });
    const chat = vi.fn(async () => "{}");
    const out = await applyGuideTurn(
      s,
      { type: "text", text: "điều khoản gì vậy" },
      baseDeps({ guideChat: chat, termsUrl: "https://terms.example/tc" }),
    );
    expect(chat).not.toHaveBeenCalled();
    expect(out.session.fields.consent).toBe(false);
    expect(out.session.step).toBe("consent");
    expect(out.messages.join("\n")).toContain("https://terms.example/tc");
    expect(out.messages.join("\n")).toMatch(/đồng ý/i);
  });

  it("after photo uses full confirm summary", async () => {
    let s = freshSession({ id: "g-sum", mode: "guide", termsVersion: "t" });
    s.fields = {
      consent: true,
      consentAt: "t",
      termsVersion: "t",
      babyName: "Tủn",
      displayName: "Tun",
      gender: "boy",
      ageRange: "1-2",
      hobby: "cars",
      photoOk: false,
    };
    s.step = "photo";
    const out = await applyGuideTurn(
      s,
      { type: "image", qc: { ok: true } },
      baseDeps(),
    );
    expect(out.session.step).toBe("confirm");
    const msg = out.messages.join("\n");
    expect(msg).toMatch(/Tủn/);
    expect(msg).toMatch(/Tun/);
    expect(msg).toMatch(/Xe hơi/);
    expect(msg).toMatch(/xác nhận|tạo video/i);
  });
```

Also update the timeout fallback test expectation to require the terms URL when `termsUrl` is set in `baseDeps` — change `baseDeps` default `termsUrl` to `"https://terms.example"` and expect it in the timeout message.

Add Guide welcome test (in `tests/huggies-machine.test.ts` or checklist/copy):

```ts
  it("guide welcome is free-text without numbered start", async () => {
    const { promptFor } = await import("@/lib/huggies/copy");
    const { freshSession } = await import("@/lib/huggies/machine");
    const s = freshSession({ id: "gw", mode: "guide", termsVersion: "t" });
    const p = promptFor(s);
    expect(p.text).not.toMatch(/gõ số|1\.\s/);
    expect(p.text).toMatch(/Huggies|ba mẹ/i);
    expect(p.buttons).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/huggies-agent.test.ts tests/huggies-machine.test.ts`

Expected: FAIL on new cases (LLM still called for terms ask; thin confirm; Flow-style welcome for guide).

- [ ] **Step 3: Wire `agent.ts`**

Import helpers and after exit check / before LLM:

```ts
import {
  confirmSummary,
  consentPrompt,
  firstMissingHint,
  looksLikeTermsAsk,
  textFieldsComplete,
} from "@/lib/huggies/checklist";
```

Replace every `firstMissingHint(session.fields)` with:

```ts
firstMissingHint(session.fields, { termsUrl: deps.termsUrl })
```

After `pushHistory(session, "user", userText)` and exit handling, **before** confirm/LLM:

```ts
  if (!session.fields.consent && looksLikeTermsAsk(userText) && !userConsents(userText)) {
    const msg = consentPrompt(deps.termsUrl);
    session.step = "consent";
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }
```

On successful photo QC path, replace thin confirm message with:

```ts
    session.fields.photoOk = true;
    session.step = "confirm";
    const msg = confirmSummary(session.fields);
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
```

Also pass `termsUrl` into `systemPrompt` missing hint:

```ts
Missing hint: ${firstMissingHint(session.fields, { termsUrl: /* cannot access deps here */ })}
```

Refactor `systemPrompt(session, termsUrl: string)` to take `termsUrl` and call from `callGuideLlm`.

- [ ] **Step 4: Guide welcome in `copy.ts`**

In `promptFor`, `case "welcome"`:

```ts
    case "welcome":
      if (session.mode === "guide") {
        return {
          text:
            "Xin chào ba mẹ! Mình là trợ lý Huggies — mình sẽ hỏi vài thông tin ngắn (trả lời tự nhiên giúp mình), rồi cùng tạo video nhảy đáng yêu cho bé nhé.\nBa mẹ nhắn “bắt đầu” hoặc cứ hỏi/trả lời để mình hỗ trợ ạ.",
          buttons: [],
        };
      }
      return surface(
        ch,
        "Xin chào ba mẹ! Mình là trợ lý Huggies — mình sẽ hỏi vài thông tin ngắn rồi cùng tạo video nhảy đáng yêu cho bé nhé.",
        [{ id: "start", label: withIcon("✨", "Bắt đầu") }],
      );
```

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run tests/huggies-agent.test.ts tests/huggies-checklist.test.ts tests/huggies-machine.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/huggies/agent.ts lib/huggies/copy.ts tests/huggies-agent.test.ts tests/huggies-machine.test.ts
git commit -m "$(cat <<'EOF'
feat(huggies): wire guide terms gate, confirm summary, free-text welcome

EOF
)"
```

---

### Task 3: Full regression + graphify

**Files:**
- Touch only if tests fail
- Run: all `tests/huggies-*.test.ts`, `tsc`, `graphify update .`

**Interfaces:**
- Consumes: Tasks 1–2
- Produces: green suite on HEAD

- [ ] **Step 1: Run full Huggies suite + tsc**

```bash
npx vitest run tests/huggies-*.test.ts
npx tsc --noEmit
```

Expected: all pass. Fix any call sites still using old `firstMissingHint(fields)` without opts (opts optional — should compile).

- [ ] **Step 2: graphify update**

```bash
graphify update .
```

- [ ] **Step 3: Commit only if fixes were needed**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(huggies): guide hard-info regression green

EOF
)"
```

If nothing to commit, skip.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| consentPrompt + URL from env/deps | 1, 2 |
| Terms ask → re-send, no LLM, stay consent | 2 |
| Guide welcome free-text | 2 |
| Hobby full labels | 1 |
| Confirm full summary | 1, 2 |
| Flow consent unchanged | (no Flow edits) |
| `.env` / example note | 1 |
| Tests listed in spec | 1, 2, 3 |

Placeholder scan: none. Signature consistency: `firstMissingHint(fields, opts?)`, `consentPrompt(termsUrl)`, `looksLikeTermsAsk(text)`, `confirmSummary(fields)`.
