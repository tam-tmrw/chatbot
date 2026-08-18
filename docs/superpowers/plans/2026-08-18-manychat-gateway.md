# ManyChat Gateway + Shared Lead Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing web chat, add a ManyChat Dynamic Block v2 callback for Facebook Messenger, persist Messenger sessions by ManyChat `user_id`, and capture name + region + finance + phone on the same lead row for both channels.

**Architecture:** `POST /api/chat` stays the web contract. `POST /api/manychat/callback` is a separate adapter: secret header → parse ManyChat JSON → `handleTurn` → Dynamic Block v2 text + `external_message_callback`. Engine looks up messenger sessions by `(channel, channelUserId)`, extracts/validates lead profile, races the LLM against a 10s timeout.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle + mysql2, Vitest. No new npm dependencies.

**Spec:** `docs/manychat-gateway-design.md`

## Global Constraints

- Conversation language: Vietnamese.
- Keep web UI and `POST /api/chat` JSON `{ sessionId, reply, leadCaptured }` unchanged.
- Do not wrap ManyChat through `/api/chat`.
- No quick replies / ManyChat buttons / Custom Field sync / Meta Send API go-live.
- Stub `POST /api/messenger/webhook` stays 501.
- Lead fields: name, region, finance, phone (phone nullable until captured).
- Invalid VN phone / unknown region: do not persist that field; re-ask.
- Auth: header `x-manychat-secret` must equal `MANYCHAT_CALLBACK_SECRET`.
- LLM timeout: 10_000ms; on timeout/throw use the existing fallback copy; never `console.log` raw phone or user text.
- Messenger text: strip markdown; no HTML.
- Demo scale: 1 Page, no queue, no rate limit.
- PII: never log raw phones or user message bodies.

---

## File map

| Path | Responsibility |
|------|----------------|
| `lib/chat/markdown.ts` | Add `stripMarkdownForMessenger` (keep `markdownToSafeHtml` for web) |
| `lib/channels/manychat.ts` | `parseManyChatBody`, `toDynamicBlock` |
| `lib/conversation/session.ts` | Add `getOrCreateSessionByChannelUser` |
| `lib/db/schema.ts` | `leads.name`, `region`, `finance`; `phone` nullable |
| `drizzle/0001_lead_profile.sql` | ALTER TABLE for those columns |
| `lib/leads/service.ts` | Incremental upsert; skip insert when all profile fields empty |
| `lib/leads/notify.ts` | `phone: string \| null` |
| `lib/conversation/intent.ts` | Add `looksLikeInvalidPhone` |
| `lib/conversation/profile.ts` | Extract + validate name/region/finance/phone |
| `lib/conversation/flow.ts` | `extractProvince` + VN place list (used by region extract) |
| `lib/conversation/engine.ts` | Messenger session lookup, profile upsert, timeout, re-ask |
| `lib/conversation/prompt.ts` | Pass missing lead fields into system prompt |
| `prompts/system.md` + `prompts/fewshots.md` | Ask one missing field; validate phone/region |
| `app/api/manychat/callback/route.ts` | HTTP adapter |
| `app/admin/leads/page.tsx` | Show name/region/finance |
| `.env.example` | `MANYCHAT_CALLBACK_SECRET`, `PUBLIC_BASE_URL` |
| `docs/manychat-gateway-design.md` | Already written — do not rewrite; README points here |
| `README.md` | ManyChat Default Reply setup |
| `tests/markdown.test.ts` | Strip markdown |
| `tests/manychat-channel.test.ts` | Parse + Dynamic Block |
| `tests/session.test.ts` | Channel-user reuse |
| `tests/profile.test.ts` / `tests/intent.test.ts` / `tests/flow.test.ts` | Extract/validate |
| `tests/leads-service.test.ts` | Incremental profile upsert |
| `tests/engine.test.ts` | Timeout, profile, messenger session |
| `tests/api-manychat.test.ts` | 401 / 200 Dynamic Block / empty text |
| `tests/api-chat.test.ts` | Regression only (must still pass) |

---

### Task 1: Strip markdown for Messenger

**Files:**
- Modify: `lib/chat/markdown.ts`
- Test: `tests/markdown.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `export function stripMarkdownForMessenger(src: string): string`

- [ ] **Step 1: Write the failing test**

Append to `tests/markdown.test.ts`:

```ts
import { markdownToSafeHtml, stripMarkdownForMessenger } from "@/lib/chat/markdown";

describe("stripMarkdownForMessenger", () => {
  it("removes bold/italic/code/headings for plain Messenger text", () => {
    expect(stripMarkdownForMessenger("**Prestige** và *flex*")).toBe(
      "Prestige và flex",
    );
    expect(stripMarkdownForMessenger("### Hook\n- 7 chỗ")).toContain("7 chỗ");
    expect(stripMarkdownForMessenger("`ADAS`")).toBe("ADAS");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/markdown.test.ts`

Expected: FAIL — `stripMarkdownForMessenger` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/chat/markdown.ts` (do not change `markdownToSafeHtml`):

```ts
export function stripMarkdownForMessenger(src: string): string {
  return src
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/markdown.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/chat/markdown.ts tests/markdown.test.ts
git commit -m "$(cat <<'EOF'
feat: strip markdown for Messenger/ManyChat text

EOF
)"
```

---

### Task 2: ManyChat channel adapter (parse + Dynamic Block)

**Files:**
- Create: `lib/channels/manychat.ts`
- Test: `tests/manychat-channel.test.ts`

**Interfaces:**
- Consumes: `IncomingMessage` from `lib/channels/types.ts`; `stripMarkdownForMessenger`
- Produces:
  - `export type ManyChatParseFail = "missing_user" | "empty_text"`
  - `export function parseManyChatBody(body: unknown): { ok: true; value: IncomingMessage } | { ok: false; reason: ManyChatParseFail }`
  - `export type ManyChatDynamicBlock = { version: "v2"; content: { messages: Array<{ type: "text"; text: string }>; actions: []; quick_replies: []; external_message_callback?: { url: string; method: "post"; headers: Record<string, string>; payload: { id: string; last_input_text: string }; timeout: number } } }`
  - `export function toDynamicBlock(text: string): ManyChatDynamicBlock`

- [ ] **Step 1: Write the failing test**

Create `tests/manychat-channel.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { parseManyChatBody, toDynamicBlock } from "@/lib/channels/manychat";

describe("parseManyChatBody", () => {
  it("reads id + last_input_text", () => {
    const r = parseManyChatBody({
      id: "mc_99",
      last_input_text: "Xin chào",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        channel: "messenger",
        channelUserId: "mc_99",
        text: "Xin chào",
      },
    });
  });

  it("accepts user_id alias and trims/clips text", () => {
    const r = parseManyChatBody({
      user_id: "u1",
      text: `  hi ${"x".repeat(2100)}`,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.channelUserId).toBe("u1");
      expect(r.value.text.length).toBe(2000);
    }
  });

  it("fails missing user or empty text", () => {
    expect(parseManyChatBody({ last_input_text: "hi" })).toEqual({
      ok: false,
      reason: "missing_user",
    });
    expect(parseManyChatBody({ id: "u1", last_input_text: "   " })).toEqual({
      ok: false,
      reason: "empty_text",
    });
  });
});

describe("toDynamicBlock", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
  });

  it("returns v2 text and callback when env set", () => {
    process.env.PUBLIC_BASE_URL = "https://demo.example";
    process.env.MANYCHAT_CALLBACK_SECRET = "s3cret";
    const block = toDynamicBlock("**Hello**");
    expect(block.version).toBe("v2");
    expect(block.content.messages).toEqual([{ type: "text", text: "Hello" }]);
    expect(block.content.quick_replies).toEqual([]);
    expect(block.content.external_message_callback).toEqual({
      url: "https://demo.example/api/manychat/callback",
      method: "post",
      headers: { "x-manychat-secret": "s3cret" },
      payload: {
        id: "{{user_id}}",
        last_input_text: "{{last_input_text}}",
      },
      timeout: 86400,
    });
  });

  it("omits callback when PUBLIC_BASE_URL missing", () => {
    delete process.env.PUBLIC_BASE_URL;
    process.env.MANYCHAT_CALLBACK_SECRET = "s3cret";
    const block = toDynamicBlock("hi");
    expect(block.content.external_message_callback).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manychat-channel.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/channels/manychat.ts`:

```ts
import type { IncomingMessage } from "@/lib/channels/types";
import { stripMarkdownForMessenger } from "@/lib/chat/markdown";

const MAX_LEN = 2000;

export type ManyChatParseFail = "missing_user" | "empty_text";

export type ManyChatDynamicBlock = {
  version: "v2";
  content: {
    messages: Array<{ type: "text"; text: string }>;
    actions: [];
    quick_replies: [];
    external_message_callback?: {
      url: string;
      method: "post";
      headers: Record<string, string>;
      payload: { id: string; last_input_text: string };
      timeout: number;
    };
  };
};

function readUserId(b: Record<string, unknown>): string {
  for (const key of ["id", "user_id", "subscriber_id"]) {
    const v = b[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function readText(b: Record<string, unknown>): string {
  for (const key of ["last_input_text", "last_input", "text", "message"]) {
    const v = b[key];
    if (typeof v === "string") return v.trim();
  }
  return "";
}

export function parseManyChatBody(
  body: unknown,
): { ok: true; value: IncomingMessage } | { ok: false; reason: ManyChatParseFail } {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "missing_user" };
  }
  const b = body as Record<string, unknown>;
  const channelUserId = readUserId(b);
  if (!channelUserId) return { ok: false, reason: "missing_user" };
  const raw = readText(b);
  if (!raw) return { ok: false, reason: "empty_text" };
  return {
    ok: true,
    value: {
      channel: "messenger",
      channelUserId,
      text: raw.slice(0, MAX_LEN),
    },
  };
}

export function toDynamicBlock(text: string): ManyChatDynamicBlock {
  const stripped = stripMarkdownForMessenger(text).slice(0, MAX_LEN);
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  const secret = process.env.MANYCHAT_CALLBACK_SECRET;
  const content: ManyChatDynamicBlock["content"] = {
    messages: [{ type: "text", text: stripped || " " }],
    actions: [],
    quick_replies: [],
  };
  if (base && secret) {
    content.external_message_callback = {
      url: `${base}/api/manychat/callback`,
      method: "post",
      headers: { "x-manychat-secret": secret },
      payload: {
        id: "{{user_id}}",
        last_input_text: "{{last_input_text}}",
      },
      timeout: 86400,
    };
  }
  return { version: "v2", content };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manychat-channel.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/channels/manychat.ts tests/manychat-channel.test.ts
git commit -m "$(cat <<'EOF'
feat: add ManyChat parse and Dynamic Block v2 mapper

EOF
)"
```

---

### Task 3: Reuse Messenger session by channel user

**Files:**
- Modify: `lib/conversation/session.ts`
- Test: `tests/session.test.ts`

**Interfaces:**
- Consumes: `ChannelName`, existing `createSession`
- Produces: `export async function getOrCreateSessionByChannelUser(channel: ChannelName, channelUserId: string): Promise<string>`

- [ ] **Step 1: Write the failing test**

Add inside the `describe.skipIf(!hasDb)` block in `tests/session.test.ts`:

```ts
import {
  appendMessage,
  getOrCreateSession,
  getOrCreateSessionByChannelUser,
  loadRecentMessages,
} from "@/lib/conversation/session";

it("reuses one messenger session per channelUserId", async () => {
  const first = await getOrCreateSessionByChannelUser("messenger", "mc-user-a");
  await appendMessage(first, "user", "turn1");
  const second = await getOrCreateSessionByChannelUser("messenger", "mc-user-a");
  expect(second).toBe(first);
  const other = await getOrCreateSessionByChannelUser("messenger", "mc-user-b");
  expect(other).not.toBe(first);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session.test.ts`

Expected: FAIL — `getOrCreateSessionByChannelUser` is not exported. If `DATABASE_URL` is unset the suite is skipped; set it before claiming this task done.

- [ ] **Step 3: Write minimal implementation**

In `lib/conversation/session.ts` change the drizzle import to `import { and, asc, desc, eq } from "drizzle-orm";` and add:

```ts
export async function getOrCreateSessionByChannelUser(
  channel: ChannelName,
  channelUserId: string,
): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.channel, channel),
        eq(sessions.channelUserId, channelUserId),
      ),
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(1);
  if (rows.length) return rows[0].id;
  return createSession(channel, channelUserId);
}
```

Do not change `getOrCreateSession` (web still keys on `sessionId`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/session.test.ts`

Expected: PASS (with `DATABASE_URL`)

- [ ] **Step 5: Commit**

```bash
git add lib/conversation/session.ts tests/session.test.ts
git commit -m "$(cat <<'EOF'
feat: reuse messenger session by channel user id

EOF
)"
```

---

### Task 4: Lead profile columns + incremental upsert

**Files:**
- Modify: `lib/db/schema.ts`, `lib/leads/service.ts`, `lib/leads/notify.ts`, `drizzle/meta/_journal.json`
- Create: `drizzle/0001_lead_profile.sql`
- Test: `tests/leads-service.test.ts`

**Interfaces:**
- Consumes: existing `leads` table
- Produces: `upsertLeadForSession(args: { sessionId: string; phone?: string | null; name?: string | null; region?: string | null; finance?: string | null; summary: string; meta?: Record<string, unknown> }): Promise<{ id: number; created: boolean } | null>` — returns `null` when all of phone/name/region/finance are empty. Merges non-empty fields; does not overwrite existing values with null/empty. `notifyLead({ id, phone: string | null, sessionId })`.

- [ ] **Step 1: Write the failing test**

Replace the upsert body in `tests/leads-service.test.ts` with:

```ts
    const first = await upsertLeadForSession({
      sessionId,
      name: "An",
      summary: "Lead Palisade · An",
    });
    const second = await upsertLeadForSession({
      sessionId,
      phone: "0912345678",
      region: "Hà Nội",
      finance: "Trả góp",
      summary: "Lead Palisade · An · Hà Nội · Trả góp · 0912345678",
    });
    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(second?.id).toBe(first?.id);

    const listed = await listLeads();
    expect(
      listed.some(
        (l) =>
          l.id === first!.id &&
          l.phone === "0912345678" &&
          l.name === "An" &&
          l.region === "Hà Nội" &&
          l.finance === "Trả góp",
      ),
    ).toBe(true);

    expect(
      await upsertLeadForSession({ sessionId, summary: "noop" }),
    ).toBeNull();
```

Change `notifyLead` call to `phone: "0912345678"` still valid. Keep `getLeadWithMessages` assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leads-service.test.ts`

Expected: FAIL — `name` not on upsert args / schema.

- [ ] **Step 3: Write minimal implementation**

In `lib/db/schema.ts` replace the `leads` table with:

```ts
export const leads = mysqlTable("leads", {
  id: int("id").primaryKey().autoincrement(),
  sessionId: varchar("session_id", { length: 36 })
    .notNull()
    .references(() => sessions.id),
  phone: varchar("phone", { length: 20 }),
  name: varchar("name", { length: 120 }),
  region: varchar("region", { length: 80 }),
  finance: varchar("finance", { length: 120 }),
  summary: text("summary"),
  meta: json("meta"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
```

Create `drizzle/0001_lead_profile.sql`:

```sql
ALTER TABLE `leads` MODIFY `phone` varchar(20);
--> statement-breakpoint
ALTER TABLE `leads` ADD `name` varchar(120);
--> statement-breakpoint
ALTER TABLE `leads` ADD `region` varchar(80);
--> statement-breakpoint
ALTER TABLE `leads` ADD `finance` varchar(120);
```

Append to `drizzle/meta/_journal.json` `entries`:

```json
{
  "idx": 1,
  "version": "5",
  "when": 1786610000000,
  "tag": "0001_lead_profile",
  "breakpoints": true
}
```

In `lib/leads/notify.ts` change `phone: string` to `phone: string | null`.

Replace `lib/leads/service.ts` with:

```ts
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { leads, messages } from "@/lib/db/schema";
import { notifyLead } from "@/lib/leads/notify";

function keep(next: string | null | undefined, prev: string | null | undefined) {
  return next || prev || null;
}

export async function upsertLeadForSession(args: {
  sessionId: string;
  phone?: string | null;
  name?: string | null;
  region?: string | null;
  finance?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<{ id: number; created: boolean } | null> {
  if (!args.phone && !args.name && !args.region && !args.finance) return null;

  const db = getDb();
  const existing = await db
    .select()
    .from(leads)
    .where(eq(leads.sessionId, args.sessionId))
    .limit(1);

  if (existing.length === 0) {
    const result = await db.insert(leads).values({
      sessionId: args.sessionId,
      phone: args.phone ?? null,
      name: args.name ?? null,
      region: args.region ?? null,
      finance: args.finance ?? null,
      summary: args.summary,
      meta: args.meta ?? null,
    });
    const id = Number(result[0].insertId);
    await notifyLead({
      id,
      phone: args.phone ?? null,
      sessionId: args.sessionId,
    });
    return { id, created: true };
  }

  const prev = existing[0];
  const id = prev.id;
  await db
    .update(leads)
    .set({
      phone: keep(args.phone, prev.phone),
      name: keep(args.name, prev.name),
      region: keep(args.region, prev.region),
      finance: keep(args.finance, prev.finance),
      summary: args.summary,
      meta: args.meta ?? prev.meta,
    })
    .where(eq(leads.id, id));
  return { id, created: false };
}

export async function listLeads() {
  const db = getDb();
  return db.select().from(leads).orderBy(desc(leads.createdAt));
}

export async function getLeadWithMessages(leadId: number) {
  const db = getDb();
  const rows = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!rows.length) return null;
  const lead = rows[0];
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, lead.sessionId))
    .orderBy(messages.id);
  return { lead, messages: msgs };
}
```

Apply migration against local MySQL (do not use `drizzle-kit push` if it tries to drop `leads_session_id_unique`):

```bash
# if drizzle-kit migrate fails, run the four ALTERs from 0001_lead_profile.sql on DATABASE_URL
npx drizzle-kit migrate
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leads-service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/leads/service.ts lib/leads/notify.ts drizzle/0001_lead_profile.sql drizzle/meta/_journal.json tests/leads-service.test.ts
git commit -m "$(cat <<'EOF'
feat: store name region finance on leads

EOF
)"
```

---

### Task 5: Profile extract + phone/region validation

**Files:**
- Create: `lib/conversation/flow.ts` (province list + `extractProvince` only — no quick replies)
- Create: `lib/conversation/profile.ts`
- Modify: `lib/conversation/intent.ts`
- Test: `tests/intent.test.ts`, `tests/profile.test.ts`, `tests/flow.test.ts`

**Interfaces:**
- Consumes: `extractVnPhone`, `extractProvince`
- Produces:
  - `export function looksLikeInvalidPhone(text: string): boolean`
  - `export function extractProvince(text: string): string | null`
  - `export type LeadProfile = { name: string | null; region: string | null; finance: string | null; phone: string | null }`
  - `export function extractName(text: string): string | null`
  - `export function extractFinance(text: string): string | null`
  - `export function extractRegion(text: string): string | null`
  - `export function extractLeadProfile(userTexts: string[]): LeadProfile`
  - `export function missingLeadFields(profile: LeadProfile): Array<keyof LeadProfile>`
  - `export function isProfileComplete(profile: LeadProfile): boolean`
  - `export function leadSummary(profile: LeadProfile): string`
  - `export function validationIssues(text: string, expectingRegion: boolean): Array<"phone" | "region">`
  - `export function validationReask(issues: Array<"phone" | "region">): string | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/intent.test.ts`:

```ts
import { extractVnPhone, looksLikeInvalidPhone, normalizeVnPhone } from "@/lib/conversation/intent";

describe("looksLikeInvalidPhone", () => {
  it("flags short or illegal prefixes, not valid VN mobiles", () => {
    expect(looksLikeInvalidPhone("Số mình 090123")).toBe(true);
    expect(looksLikeInvalidPhone("0123456789")).toBe(true);
    expect(looksLikeInvalidPhone("0901234567")).toBe(false);
    expect(looksLikeInvalidPhone("Palisade có gì hay?")).toBe(false);
  });
});
```

Create `tests/flow.test.ts`:

```ts
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
```

Create `tests/profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  extractFinance,
  extractLeadProfile,
  extractName,
  extractRegion,
  isProfileComplete,
  looksLikeInvalidRegion,
  missingLeadFields,
  validationReask,
} from "@/lib/conversation/profile";

describe("extractName", () => {
  it("reads Vietnamese name introductions", () => {
    expect(extractName("Tên mình là Nguyễn An")).toBe("Nguyễn An");
    expect(extractName("Mình là Minh")).toBe("Minh");
  });
  it("ignores non-names", () => {
    expect(extractName("Mình là người thích xe")).toBeNull();
  });
});

describe("extractRegion + extractFinance", () => {
  it("reads city and finance", () => {
    expect(extractRegion("Mình ở Hà Nội")).toBe("Hà Nội");
    expect(extractRegion("Hà Nội")).toBe("Hà Nội");
    expect(extractFinance("Mình tính trả góp")).toBe("Trả góp");
    expect(extractFinance("Tiền mặt tầm 1.5 tỷ")).toBe("Tiền mặt (~1.5 tỷ)");
  });
  it("rejects unknown địa chỉ", () => {
    expect(extractRegion("Mình ở xyzland")).toBeNull();
    expect(looksLikeInvalidRegion("Mình ở xyzland", false)).toBe(true);
    expect(validationReask(["phone"])).toMatch(/định dạng/i);
    expect(validationReask(["region"])).toMatch(/chưa nhận ra/i);
  });
});

describe("extractLeadProfile", () => {
  it("merges fields across user turns", () => {
    const p = extractLeadProfile([
      "Tên mình là An",
      "Ở TP.HCM",
      "Trả góp",
      "SĐT 0901234567",
    ]);
    expect(p).toEqual({
      name: "An",
      region: "TP. Hồ Chí Minh",
      finance: "Trả góp",
      phone: "0901234567",
    });
    expect(isProfileComplete(p)).toBe(true);
    expect(missingLeadFields({ ...p, phone: null })).toEqual(["phone"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/intent.test.ts tests/profile.test.ts tests/flow.test.ts`

Expected: FAIL — new exports missing.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/conversation/intent.ts`:

```ts
export function looksLikeInvalidPhone(text: string): boolean {
  if (extractVnPhone(text)) return false;
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 8) return true;
  return (
    /(?:sđt|số\s*(?:điện\s*)?(?:thoại|dt|mình|em|anh|chị)?|\bphone\b)/i.test(
      text,
    ) && /\d{6,}/.test(text)
  );
}
```

Create `lib/conversation/flow.ts` with `foldVn`, the 63-province `REGION_LABELS` list plus cities (Đà Lạt, Nha Trang, Bình Dương, Vũng Tàu, Biên Hòa, Thủ Đức, Quy Nhơn, Phan Thiết, Buôn Ma Thuột, Mỹ Tho, Hạ Long, Huế), aliases for HCM/Sài Gòn/Bà Rịa, sorted longest-key-first `PROVINCES`, and:

```ts
export function extractProvince(text: string): string | null {
  const t = foldVn(text);
  for (const p of PROVINCES) {
    if (t.includes(p.key)) return p.label;
  }
  return null;
}
```

Copy the exact `REGION_LABELS` / `REGION_ALIASES` / `foldVn` from the design working copy used on main (Hà Nội, TP. Hồ Chí Minh, … Yên Bái). Do **not** export `quickRepliesFor` or flow stages.

Create `lib/conversation/profile.ts` implementing extractors:

- `extractName`: regex introductions `tên mình là` / `mình là` + `looksLikeName` stopwords (`người|muốn|thích|anh|chị|em|bạn|mai`).
- `extractFinance`: skip exact `Trả góp / tài chính`; map tiền mặt / trả góp / ngân sách+tỷ.
- `extractRegion`: known bare province if short and not lifestyle chip (`đi|hay|lái|gia đình|palisade`); else require location cue (`ở|sống tại|hộ khẩu|…`) then `extractProvince` only — unknown places return null (do not save free text).
- `looksLikeInvalidRegion(text, expectingRegion)`: true when location cue present but no known province, or expectingRegion and the message looks like a 2–6 word place that is not in the list; false for lifestyle/price/name/phone-digit messages.
- `extractLeadProfile`: fold user texts, last-wins per field via `??` previous.
- `missingLeadFields` order: name, region, finance, phone.
- `validationIssues`: invalid phone and/or region.
- `validationReask`:
  - phone: `SĐT này chưa đúng định dạng VN nha (10 số, đầu 03 / 05 / 07 / 08 / 09). Gửi lại giúp MAI được không?`
  - region: `Khu vực này MAI chưa nhận ra 💛 Chọn giúp mình tỉnh/thành nhé — vd. Hà Nội, TP.HCM, Đà Nẵng, Bình Dương, Đà Lạt…`
- `leadSummary`: join `Lead Palisade` + non-null fields with ` · `.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/intent.test.ts tests/profile.test.ts tests/flow.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/conversation/intent.ts lib/conversation/flow.ts lib/conversation/profile.ts tests/intent.test.ts tests/profile.test.ts tests/flow.test.ts
git commit -m "$(cat <<'EOF'
feat: extract and validate lead name region finance phone

EOF
)"
```

---

### Task 6: Engine — profile, messenger session, LLM timeout

**Files:**
- Modify: `lib/conversation/engine.ts`, `lib/conversation/prompt.ts`, `prompts/system.md`, `prompts/fewshots.md`
- Test: `tests/engine.test.ts`

**Interfaces:**
- Consumes: `getOrCreateSession`, `getOrCreateSessionByChannelUser`, `extractLeadProfile`, `missingLeadFields`, `validationIssues`, `validationReask`, `leadSummary`, `upsertLeadForSession`, `buildSystemPrompt(userText, missing?: string[])`
- Produces: `handleTurn(input, deps?: { llm?: LlmProvider; llmTimeoutMs?: number }): Promise<OutgoingMessage>` — messenger channel ignores `input.sessionId` and uses `getOrCreateSessionByChannelUser`. Default `llmTimeoutMs` is `10000`. `leadCaptured` remains `Boolean(profile.phone)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/engine.test.ts` inside `describe.skipIf(!hasDb)`:

```ts
  it("reuses messenger session across turns", async () => {
    const first = await handleTurn(
      {
        channel: "messenger",
        channelUserId: "engine-mc-same",
        text: "hello",
      },
      { llm: mockLlm },
    );
    const second = await handleTurn(
      {
        channel: "messenger",
        channelUserId: "engine-mc-same",
        text: "ủa sao vậy",
      },
      { llm: mockLlm },
    );
    expect(second.sessionId).toBe(first.sessionId);
  });

  it("saves name/region/finance before phone", async () => {
    const { listLeads } = await import("@/lib/leads/service");
    const first = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-profile",
        text: "Tên mình là An",
      },
      { llm: mockLlm },
    );
    expect(first.leadCaptured).toBe(false);
    await handleTurn(
      {
        sessionId: first.sessionId,
        channel: "web",
        channelUserId: "engine-user-profile",
        text: "Mình ở Hà Nội",
      },
      { llm: mockLlm },
    );
    await handleTurn(
      {
        sessionId: first.sessionId,
        channel: "web",
        channelUserId: "engine-user-profile",
        text: "Trả góp",
      },
      { llm: mockLlm },
    );
    const row = (await listLeads()).find((l) => l.sessionId === first.sessionId);
    expect(row?.name).toBe("An");
    expect(row?.region).toBe("Hà Nội");
    expect(row?.finance).toBe("Trả góp");
    expect(row?.phone).toBeNull();
  });

  it("does not save invalid phone and re-asks", async () => {
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-bad-phone",
        text: "Số mình 0123456789",
      },
      { llm: mockLlm },
    );
    expect(out.leadCaptured).toBe(false);
    expect(out.text).toMatch(/định dạng/i);
  });

  it("falls back when LLM exceeds timeout", async () => {
    const slow: LlmProvider = {
      async chat() {
        await new Promise((r) => setTimeout(r, 200));
        return "should not appear";
      },
    };
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-timeout",
        text: "hello",
      },
      { llm: slow, llmTimeoutMs: 20 },
    );
    expect(out.text).toContain("đơ một nhịp");
    expect(out.text).not.toContain("should not appear");
  });
```

Keep existing fallback/phone tests; phone-only capture still valid.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine.test.ts`

Expected: FAIL — messenger creates two sessions; timeout not implemented; invalid 0123 may still not re-ask.

- [ ] **Step 3: Write minimal implementation**

Update `buildSystemPrompt` in `lib/conversation/prompt.ts`:

```ts
export function buildSystemPrompt(
  userText: string,
  missing?: string[],
): string {
  const root = process.cwd();
  const system = readFileSync(path.join(root, "prompts/system.md"), "utf8");
  const few = readFileSync(path.join(root, "prompts/fewshots.md"), "utf8");
  const kb = loadKnowledgeContext(userText);
  const missingLine =
    missing?.length
      ? `\n【LEAD PROFILE — còn thiếu】${missing.join(", ")} — hỏi đúng 1 field: name=tên gọi, region=tỉnh/thành VN, finance=tiền mặt/trả góp, phone=SĐT 10 số VN. Sai SĐT/địa chỉ thì hỏi lại, không ghi nhận. Không bịa lãi/lăn bánh.`
      : "";
  return `${system}${missingLine}\n\n【KNOWLEDGE】\n${kb}\n\n【FEWSHOTS】\n${few}`;
}
```

In `prompts/system.md` CONVERSATION FLOW step 4, replace SĐT-only with: ask missing fields one at a time (name → region → finance → phone); invalid VN phone or unknown province → ask again, do not invent rates.

In `prompts/fewshots.md` append:

```
---
User: Số mình 0123
Assistant: SĐT này chưa đúng định dạng VN nha (10 số, đầu 03 / 05 / 07 / 08 / 09). Gửi lại giúp MAI được không?

---
User: Mình ở xyzland
Assistant: Khu vực này MAI chưa nhận ra 💛 Chọn giúp mình tỉnh/thành nhé — vd. Hà Nội, TP.HCM, Đà Nẵng, Bình Dương, Đà Lạt…
```

Replace `lib/conversation/engine.ts` with:

```ts
import type { IncomingMessage, OutgoingMessage } from "@/lib/channels/types";
import {
  extractLeadProfile,
  leadSummary,
  missingLeadFields,
  validationIssues,
  validationReask,
} from "@/lib/conversation/profile";
import { buildSystemPrompt } from "@/lib/conversation/prompt";
import {
  appendMessage,
  getOrCreateSession,
  getOrCreateSessionByChannelUser,
  loadRecentMessages,
} from "@/lib/conversation/session";
import { upsertLeadForSession } from "@/lib/leads/service";
import { getLlmProvider, type LlmProvider } from "@/lib/llm";
import type { ChatMessage } from "@/lib/llm/types";

const FALLBACK =
  "Úi vừa đơ một nhịp xíu 🚨 nhắn lại mình nhaaa — MAI vẫn ở đây!";

const DEFAULT_LLM_TIMEOUT_MS = 10_000;

async function chatWithTimeout(
  llm: LlmProvider,
  messages: ChatMessage[],
  ms: number,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM timeout")), ms);
  });
  try {
    return await Promise.race([llm.chat(messages), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function handleTurn(
  input: IncomingMessage,
  deps?: { llm?: LlmProvider; llmTimeoutMs?: number },
): Promise<OutgoingMessage> {
  const sessionId =
    input.channel === "messenger"
      ? await getOrCreateSessionByChannelUser(
          input.channel,
          input.channelUserId,
        )
      : await getOrCreateSession(
          input.sessionId,
          input.channel,
          input.channelUserId,
        );
  await appendMessage(sessionId, "user", input.text);

  const history = await loadRecentMessages(sessionId, 12);
  const userTexts = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const profile = extractLeadProfile(userTexts);
  const missing = missingLeadFields(profile);
  const issues = validationIssues(input.text, missing[0] === "region");

  if (profile.phone || profile.name || profile.region || profile.finance) {
    await upsertLeadForSession({
      sessionId,
      phone: profile.phone,
      name: profile.name,
      region: profile.region,
      finance: profile.finance,
      summary: leadSummary(profile),
      meta: { ...profile },
    });
  }

  const leadCaptured = Boolean(profile.phone);
  const reask = validationReask(issues);
  let reply: string;
  if (reask) {
    reply = reask;
  } else {
    try {
      const llm = deps?.llm ?? getLlmProvider();
      reply = await chatWithTimeout(
        llm,
        [
          {
            role: "system",
            content: buildSystemPrompt(input.text, missing),
          },
          ...history.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })),
        ],
        deps?.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      console.error("[llm]", reason);
      reply = FALLBACK;
    }
  }

  await appendMessage(sessionId, "assistant", reply);
  return { sessionId, text: reply, leadCaptured };
}
```

Do not include LLM error text in the user-facing reply (prod and demo Page).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine.test.ts tests/api-chat.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/conversation/engine.ts lib/conversation/prompt.ts prompts/system.md prompts/fewshots.md tests/engine.test.ts
git commit -m "$(cat <<'EOF'
feat: persist lead profile and timeout LLM in handleTurn

EOF
)"
```

---

### Task 7: `POST /api/manychat/callback`

**Files:**
- Create: `app/api/manychat/callback/route.ts`
- Modify: `.env.example`, `README.md`
- Test: `tests/api-manychat.test.ts`

**Interfaces:**
- Consumes: `parseManyChatBody`, `toDynamicBlock`, `handleTurn`
- Produces: `export async function POST(req: Request): Promise<Response>`

Behavior (exact):
- If `MANYCHAT_CALLBACK_SECRET` unset → 503 `{ error: "Chat unavailable" }`
- If header `x-manychat-secret` !== secret → 401 `{ error: "Unauthorized" }`
- Invalid JSON → 200 `toDynamicBlock("Úi MAI chưa nhận ra tin này — nhắn lại giúp mình một câu nhé!")`
- `missing_user` → 200 `toDynamicBlock("Úi MAI chưa nhận ra bạn — nhắn lại giúp mình một câu nhé!")`
- `empty_text` → 200 `toDynamicBlock("Nhắn chữ giúp MAI nhaaa — ảnh/sticker mình chưa đọc được.")`
- `handleTurn` success → 200 `toDynamicBlock(out.text)`
- `handleTurn` throw matching `/DATABASE_URL|ECONNREFUSED|mysql/i` → 503 `{ error: "Chat unavailable" }`
- other throw → 200 `toDynamicBlock` with the same FALLBACK sentence as engine (`Úi vừa đơ một nhịp xíu 🚨 nhắn lại mình nhaaa — MAI vẫn ở đây!`) so ManyChat still delivers a message

- [ ] **Step 1: Write the failing test**

Create `tests/api-manychat.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/conversation/engine", () => ({
  handleTurn: vi.fn(async () => ({
    sessionId: "sess-mc",
    text: "**Yassss** hello",
    leadCaptured: false,
  })),
}));

import { POST } from "@/app/api/manychat/callback/route";
import { handleTurn } from "@/lib/conversation/engine";

const prev = { ...process.env };

afterEach(() => {
  process.env = { ...prev };
  vi.mocked(handleTurn).mockClear();
});

function req(body: unknown, secret?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) headers["x-manychat-secret"] = secret;
  return new Request("http://localhost/api/manychat/callback", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/manychat/callback", () => {
  it("returns 503 when secret env missing", async () => {
    delete process.env.MANYCHAT_CALLBACK_SECRET;
    const res = await POST(req({ id: "u", last_input_text: "hi" }, "x"));
    expect(res.status).toBe(503);
  });

  it("returns 401 on bad secret", async () => {
    process.env.MANYCHAT_CALLBACK_SECRET = "good";
    const res = await POST(req({ id: "u", last_input_text: "hi" }, "bad"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 nudge on empty text without calling engine", async () => {
    process.env.MANYCHAT_CALLBACK_SECRET = "good";
    process.env.PUBLIC_BASE_URL = "https://demo.example";
    const res = await POST(req({ id: "u", last_input_text: "  " }, "good"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.version).toBe("v2");
    expect(json.content.messages[0].text).toMatch(/Nhắn chữ/i);
    expect(handleTurn).not.toHaveBeenCalled();
  });

  it("returns Dynamic Block from handleTurn", async () => {
    process.env.MANYCHAT_CALLBACK_SECRET = "good";
    process.env.PUBLIC_BASE_URL = "https://demo.example";
    const res = await POST(
      req({ id: "u1", last_input_text: "hello" }, "good"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content.messages[0].text).toBe("Yassss hello");
    expect(json.content.external_message_callback.url).toBe(
      "https://demo.example/api/manychat/callback",
    );
    expect(handleTurn).toHaveBeenCalledWith({
      channel: "messenger",
      channelUserId: "u1",
      text: "hello",
    });
  });

  it("returns 503 when database unavailable", async () => {
    process.env.MANYCHAT_CALLBACK_SECRET = "good";
    vi.mocked(handleTurn).mockRejectedValueOnce(
      new Error("DATABASE_URL is not set"),
    );
    const res = await POST(req({ id: "u", last_input_text: "hi" }, "good"));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-manychat.test.ts`

Expected: FAIL — route missing.

- [ ] **Step 3: Write minimal implementation**

Create `app/api/manychat/callback/route.ts`:

```ts
import { parseManyChatBody, toDynamicBlock } from "@/lib/channels/manychat";
import { handleTurn } from "@/lib/conversation/engine";

const NUDGE_USER =
  "Úi MAI chưa nhận ra bạn — nhắn lại giúp mình một câu nhé!";
const NUDGE_TEXT =
  "Nhắn chữ giúp MAI nhaaa — ảnh/sticker mình chưa đọc được.";
const NUDGE_JSON =
  "Úi MAI chưa nhận ra tin này — nhắn lại giúp mình một câu nhé!";
const FALLBACK =
  "Úi vừa đơ một nhịp xíu 🚨 nhắn lại mình nhaaa — MAI vẫn ở đây!";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function unavailable() {
  return Response.json({ error: "Chat unavailable" }, { status: 503 });
}

export async function POST(req: Request) {
  const secret = process.env.MANYCHAT_CALLBACK_SECRET;
  if (!secret) return unavailable();
  if (req.headers.get("x-manychat-secret") !== secret) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(toDynamicBlock(NUDGE_JSON));
  }

  const parsed = parseManyChatBody(body);
  if (!parsed.ok) {
    const text = parsed.reason === "empty_text" ? NUDGE_TEXT : NUDGE_USER;
    return Response.json(toDynamicBlock(text));
  }

  try {
    const out = await handleTurn(parsed.value);
    return Response.json(toDynamicBlock(out.text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    if (/DATABASE_URL|ECONNREFUSED|mysql/i.test(msg)) return unavailable();
    return Response.json(toDynamicBlock(FALLBACK));
  }
}
```

Append to `.env.example`:

```
MANYCHAT_CALLBACK_SECRET=change-me
PUBLIC_BASE_URL=https://your-https-host.example
```

Append to `README.md`:

```md
## ManyChat (Facebook Page)

1. Deploy over HTTPS. Set `MANYCHAT_CALLBACK_SECRET` and `PUBLIC_BASE_URL`.
2. In ManyChat Default Reply, add a Dynamic Block POST to `{PUBLIC_BASE_URL}/api/manychat/callback` with header `x-manychat-secret`.
3. Body JSON: `{ "id": "{{user_id}}", "last_input_text": "{{last_input_text}}" }`.
4. Set a ManyChat fallback message if the request fails.
5. Web chat at `/` is unchanged.

Details: `docs/manychat-gateway-design.md`.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api-manychat.test.ts tests/api-chat.test.ts tests/messenger-stub.test.ts`

Expected: PASS — web contract unchanged; messenger webhook still 501.

- [ ] **Step 5: Commit**

```bash
git add app/api/manychat/callback/route.ts tests/api-manychat.test.ts .env.example README.md
git commit -m "$(cat <<'EOF'
feat: add ManyChat Dynamic Block callback endpoint

EOF
)"
```

---

### Task 8: Admin lead fields + graphify

**Files:**
- Modify: `app/admin/leads/page.tsx`

**Interfaces:**
- Consumes: `listLeads` JSON now includes `name`, `region`, `finance`, nullable `phone`
- Produces: admin list/detail shows those fields

- [ ] **Step 1: Write the failing check (type + UI fields)**

Update `Lead` in `app/admin/leads/page.tsx` to:

```ts
type Lead = {
  id: number;
  phone: string | null;
  name: string | null;
  region: string | null;
  finance: string | null;
  summary: string | null;
  createdAt: string;
};
```

If TypeScript already allows extra JSON fields, this step is the implementation; there is no separate unit test. Verify with:

Run: `npx tsc --noEmit`

Expected: FAIL until the page uses the new optional fields consistently (or PASS after Step 3).

- [ ] **Step 2: Confirm tsc fails or notes unused shape**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Update list/detail markup**

List row:

```tsx
<strong>{lead.name ?? lead.phone ?? "Lead"}</strong>
<span>
  {[lead.phone, lead.region, lead.finance].filter(Boolean).join(" · ") ||
    (lead.summary ?? "—")}
</span>
```

Detail:

```tsx
<h2>{selected.name ?? selected.phone ?? "Lead"}</h2>
<p>
  {[selected.phone, selected.region, selected.finance]
    .filter(Boolean)
    .join(" · ")}
</p>
<p>{selected.summary}</p>
```

- [ ] **Step 4: Run tsc + full test suite**

Run: `npx tsc --noEmit && npx vitest run`

Expected: PASS (DB tests skip if no `DATABASE_URL`)

- [ ] **Step 5: Update graphify and commit**

Run: `graphify update .`

```bash
git add app/admin/leads/page.tsx
git commit -m "$(cat <<'EOF'
feat: show lead name region finance in admin

EOF
)"
```

Do not commit `graphify-out/` unless the repo already tracks it.

---

## Self-review

**1. Spec coverage**
- Dedicated callback + keep web → Task 7 + existing `/api/chat`
- Dynamic Block v2 + `external_message_callback` → Task 2 + 7
- Session by ManyChat user_id → Task 3 + 6
- Name/region/finance/phone + validation → Task 4 + 5 + 6
- Timeout 8–10s + fallback → Task 6 (`10000` ms)
- Secret header → Task 7
- Strip markdown → Task 1 + `toDynamicBlock`
- Empty/non-text nudge 200 → Task 7
- Admin sales-usable fields → Task 8
- No quick replies / no Meta Send / webhook stub stays → Task 7 regression
- ManyChat console steps → README in Task 7

**2. Placeholder scan:** none remaining; province list is specified as the 63-tỉnh set in Task 5.

**3. Type consistency:** `parseManyChatBody` / `toDynamicBlock` / `getOrCreateSessionByChannelUser` / `upsertLeadForSession` / `handleTurn` deps `llmTimeoutMs` match across tasks.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-18-manychat-gateway.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
