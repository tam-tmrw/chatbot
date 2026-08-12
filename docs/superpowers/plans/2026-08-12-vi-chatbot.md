# Virtual Influencer Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js modular-monolith web chat prototype where a Vietnamese “car-savvy bestie” Virtual Influencer discusses Hyundai Palisade and captures test-drive leads (phone) into MySQL, with an admin list and a Messenger-ready channel boundary.

**Architecture:** Channel adapters normalize to `IncomingMessage` → `ConversationEngine` loads MySQL session history, injects curated Palisade KB + system prompt, calls an LLM port (default OpenAI), post-processes VN phone → `leads`, returns `OutgoingMessage`. Web UI uses `POST /api/chat`; Messenger webhook is a stub that reuses the same engine types.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM + mysql2, Vitest, OpenAI SDK, curated JSON KB (no RAG).

**Spec:** `docs/vi-chatbot-design-and-plan.md`

## Global Constraints

- Language of conversation: Vietnamese.
- Database: MySQL only (no SQLite/Postgres fallback in v1).
- LLM: provider abstraction; default `LLM_PROVIDER=openai`.
- Knowledge: curated files under `lib/knowledge/` — no vector DB / RAG in v1.
- Lead notify: implement `notifyLead()` as no-op hook; do not require Slack/email.
- Persona: generic car-savvy bestie via `prompts/system.md` — must not role-play Hyundai sales or CS staff.
- Prices/specs: treat as “tham khảo”; do not invent numbers outside KB.
- Context window: last 12 messages per turn.
- One primary lead per session; new phone updates the same lead row.
- Phone is PII: never `console.log` raw phone in production paths.
- Demo DoD = 7 criteria in the design doc; live Facebook Messenger Send API is out of scope for v1 (stub only).

---

## File map (create unless noted)

| Path | Responsibility |
|------|----------------|
| `package.json` | Scripts: `dev`, `build`, `test`, `db:generate`, `db:migrate`, `db:studio` |
| `.env.example` | `DATABASE_URL`, `LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ADMIN_SECRET` |
| `drizzle.config.ts` | Drizzle Kit → MySQL |
| `vitest.config.ts` | Node test environment |
| `lib/db/schema.ts` | `sessions`, `messages`, `leads` tables |
| `lib/db/client.ts` | Drizzle MySQL singleton |
| `lib/channels/types.ts` | `IncomingMessage`, `OutgoingMessage`, `ChatRole` |
| `lib/channels/web.ts` | Parse/validate web chat body |
| `lib/channels/messenger.ts` | Stub normalize helpers for future webhook |
| `lib/conversation/intent.ts` | `extractVnPhone`, `normalizeVnPhone` |
| `lib/conversation/session.ts` | Create session, append message, load last N |
| `lib/conversation/engine.ts` | `handleTurn(input): Promise<OutgoingMessage>` |
| `lib/llm/types.ts` | `ChatMessage`, `LlmProvider` |
| `lib/llm/openai.ts` | OpenAI chat completions impl |
| `lib/llm/index.ts` | `getLlmProvider()` from env |
| `lib/knowledge/palisade.json` | Curated product KB |
| `lib/knowledge/loader.ts` | `loadKnowledgeContext(userText): string` |
| `lib/leads/service.ts` | `upsertLeadForSession`, `listLeads`, `getLeadWithMessages` |
| `lib/leads/notify.ts` | `notifyLead(lead)` no-op |
| `prompts/system.md` | Persona + rules + conversation flow |
| `prompts/fewshots.md` | Optional short examples |
| `app/api/chat/route.ts` | Web channel HTTP entry |
| `app/api/messenger/webhook/route.ts` | Stub verify + 501 for messages |
| `app/page.tsx` | Messenger-like chat UI |
| `app/admin/leads/page.tsx` | Lead list + detail |
| `app/layout.tsx` | Root layout + disclaimer footer hook |
| `tests/intent.test.ts` | Phone extraction |
| `tests/knowledge-loader.test.ts` | KB slice |
| `tests/web-channel.test.ts` | Body validation |
| `tests/leads-service.test.ts` | Upsert lead (uses test DB or mocked db — prefer real MySQL if `DATABASE_URL` set) |
| `docs/messenger-next-steps.md` | How to wire real Messenger later |
| `README.md` | Local run instructions |

---

### Task 1: Scaffold Next.js + Vitest + env

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `README.md`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: none
- Produces: runnable `npm run dev`, `npm test`; Vitest config with `@/` → project root

- [ ] **Step 1: Scaffold the Next.js app in the repo root**

Run from `/Users/nktam/Projects/TMRW/virtual-influencer-chatbot` (repo is currently empty except `.cursor/` and `docs/`):

```bash
npx create-next-app@15 . --typescript --eslint --app --src-dir=false --tailwind --import-alias "@/*" --turbopack --yes
```

If create-next-app refuses non-empty dir, scaffold into `/tmp/vi-scaffold` then copy `app`, `public`, config files into the repo without deleting `docs/` or `.cursor/`.

- [ ] **Step 2: Add Vitest + write failing smoke test**

```bash
npm install -D vitest @vitejs/plugin-react
```

Create `vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

Create `tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("scaffold", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test`  
Expected: PASS `tests/smoke.test.ts`

- [ ] **Step 4: Add `.env.example` and README run notes**

`.env.example`:

```env
DATABASE_URL=mysql://vi:vi@127.0.0.1:3306/vi_chatbot
LLM_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
ADMIN_SECRET=change-me
```

`README.md` must document: Node 20+, MySQL 8, copy `.env.example` → `.env.local`, `npm install`, `npm run dev`, `npm test`.

Replace default `app/page.tsx` with a one-line placeholder: `<main>VI Chatbot</main>` (full UI in Task 9).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: scaffold Next.js app with Vitest and env template

EOF
)"
```

---

### Task 2: VN phone intent helpers (pure, TDD)

**Files:**
- Create: `lib/conversation/intent.ts`
- Test: `tests/intent.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `extractVnPhone(text: string): string | null` — returns normalized `0xxxxxxxxx` (10 digits) or null
  - `normalizeVnPhone(raw: string): string | null` — accepts `+84` / `84` / spaced digits

- [ ] **Step 1: Write the failing tests**

Create `tests/intent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractVnPhone, normalizeVnPhone } from "@/lib/conversation/intent";

describe("normalizeVnPhone", () => {
  it("normalizes +84 to leading 0", () => {
    expect(normalizeVnPhone("+84901234567")).toBe("0901234567");
  });

  it("strips spaces and dots", () => {
    expect(normalizeVnPhone("0901 234 567")).toBe("0901234567");
  });

  it("rejects too-short numbers", () => {
    expect(normalizeVnPhone("090123")).toBeNull();
  });
});

describe("extractVnPhone", () => {
  it("finds phone inside a sentence", () => {
    expect(extractVnPhone("Chị liên hệ mình số 0901 234 567 nhé")).toBe(
      "0901234567",
    );
  });

  it("returns null when no phone", () => {
    expect(extractVnPhone("Xe này bao nhiêu vậy?")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/intent.test.ts`  
Expected: FAIL — cannot find module `@/lib/conversation/intent`

- [ ] **Step 3: Write minimal implementation**

Create `lib/conversation/intent.ts`:

```ts
const VN_MOBILE =
  /(?:\+?84|0)(?:3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])(?:[\s.]?\d){7}/g;

export function normalizeVnPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("84") && local.length === 11) {
    local = `0${local.slice(2)}`;
  }
  if (!/^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9\d)\d{7}$/.test(local)) {
    return null;
  }
  return local;
}

export function extractVnPhone(text: string): string | null {
  const matches = text.match(VN_MOBILE);
  if (!matches?.length) return null;
  for (const m of matches) {
    const n = normalizeVnPhone(m);
    if (n) return n;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/intent.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/conversation/intent.ts tests/intent.test.ts
git commit -m "$(cat <<'EOF'
feat: add Vietnamese phone extract and normalize helpers

EOF
)"
```

---

### Task 3: Channel types + web body validation (TDD)

**Files:**
- Create: `lib/channels/types.ts`, `lib/channels/web.ts`
- Test: `tests/web-channel.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `IncomingMessage = { sessionId?: string; channelUserId: string; channel: "web" | "messenger"; text: string }`
  - `OutgoingMessage = { sessionId: string; text: string; leadCaptured: boolean }`
  - `parseWebChatBody(body: unknown): { ok: true; value: IncomingMessage } | { ok: false; error: string }`
  - Max text length: 2000; empty/whitespace → error

- [ ] **Step 1: Write the failing tests**

Create `tests/web-channel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWebChatBody } from "@/lib/channels/web";

describe("parseWebChatBody", () => {
  it("accepts valid payload", () => {
    const r = parseWebChatBody({
      message: "Xin chào",
      sessionId: "sess_1",
      channelUserId: "browser_1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        sessionId: "sess_1",
        channelUserId: "browser_1",
        channel: "web",
        text: "Xin chào",
      });
    }
  });

  it("rejects empty message", () => {
    const r = parseWebChatBody({ message: "   ", channelUserId: "x" });
    expect(r.ok).toBe(false);
  });

  it("defaults channelUserId when missing", () => {
    const r = parseWebChatBody({ message: "hi" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.channelUserId).toBe("anonymous");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/web-channel.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

`lib/channels/types.ts`:

```ts
export type ChannelName = "web" | "messenger";

export type IncomingMessage = {
  sessionId?: string;
  channelUserId: string;
  channel: ChannelName;
  text: string;
};

export type OutgoingMessage = {
  sessionId: string;
  text: string;
  leadCaptured: boolean;
};
```

`lib/channels/web.ts`:

```ts
import type { IncomingMessage } from "@/lib/channels/types";

const MAX_LEN = 2000;

export function parseWebChatBody(
  body: unknown,
): { ok: true; value: IncomingMessage } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }
  const b = body as Record<string, unknown>;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) return { ok: false, error: "message is required" };
  if (message.length > MAX_LEN) {
    return { ok: false, error: `message exceeds ${MAX_LEN} characters` };
  }
  const sessionId =
    typeof b.sessionId === "string" && b.sessionId.length > 0
      ? b.sessionId
      : undefined;
  const channelUserId =
    typeof b.channelUserId === "string" && b.channelUserId.length > 0
      ? b.channelUserId
      : "anonymous";

  return {
    ok: true,
    value: {
      sessionId,
      channelUserId,
      channel: "web",
      text: message,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/web-channel.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/channels/types.ts lib/channels/web.ts tests/web-channel.test.ts
git commit -m "$(cat <<'EOF'
feat: add channel types and web chat body parser

EOF
)"
```

---

### Task 4: MySQL schema + Drizzle client

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/client.ts`, `drizzle.config.ts`
- Modify: `package.json` (deps + scripts), `.env.example` (already has `DATABASE_URL`)
- Test: `tests/db-smoke.test.ts` (skips if no `DATABASE_URL`)

**Interfaces:**
- Consumes: `DATABASE_URL` mysql connection string
- Produces:
  - Tables: `sessions`, `messages`, `leads` as in design doc
  - `getDb()` returning Drizzle instance
  - Session `id` is `varchar(36)` UUID string (generate in app with `crypto.randomUUID()`)

- [ ] **Step 1: Install deps**

```bash
npm install drizzle-orm mysql2
npm install -D drizzle-kit dotenv
```

- [ ] **Step 2: Write schema**

`lib/db/schema.ts`:

```ts
import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  json,
  int,
} from "drizzle-orm/mysql-core";

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  channel: mysqlEnum("channel", ["web", "messenger"]).notNull(),
  channelUserId: varchar("channel_user_id", { length: 191 }).notNull(),
  stage: varchar("stage", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").primaryKey().autoincrement(),
  sessionId: varchar("session_id", { length: 36 })
    .notNull()
    .references(() => sessions.id),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leads = mysqlTable("leads", {
  id: int("id").primaryKey().autoincrement(),
  sessionId: varchar("session_id", { length: 36 })
    .notNull()
    .references(() => sessions.id),
  phone: varchar("phone", { length: 20 }).notNull(),
  summary: text("summary"),
  meta: json("meta"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
```

`lib/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@/lib/db/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = mysql.createPool(url);
  _db = drizzle(pool, { schema, mode: "default" });
  return _db;
}
```

`drizzle.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Add scripts:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push"
}
```

- [ ] **Step 3: Write db smoke test (skip without DATABASE_URL)**

`tests/db-smoke.test.ts`:

```ts
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
```

- [ ] **Step 4: Push schema to local MySQL**

Ensure MySQL is running and database exists, e.g.:

```bash
docker run -d --name vi-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=vi_chatbot -e MYSQL_USER=vi -e MYSQL_PASSWORD=vi -p 3306:3306 mysql:8
cp .env.example .env.local
# load env for drizzle: export $(grep -v '^#' .env.local | xargs)
npx drizzle-kit push
```

Run: `DATABASE_URL='mysql://vi:vi@127.0.0.1:3306/vi_chatbot' npm test -- tests/db-smoke.test.ts`  
Expected: PASS (or skip if no DB — do not merge Task 4 without at least one successful `drizzle-kit push` on a real MySQL).

- [ ] **Step 5: Commit**

```bash
git add lib/db drizzle.config.ts package.json package-lock.json tests/db-smoke.test.ts drizzle
git commit -m "$(cat <<'EOF'
feat: add MySQL schema and Drizzle client

EOF
)"
```

---

### Task 5: Session persistence helpers

**Files:**
- Create: `lib/conversation/session.ts`
- Test: `tests/session.test.ts`

**Interfaces:**
- Consumes: `getDb()`, schema tables, `IncomingMessage.channel`
- Produces:
  - `createSession(channel, channelUserId): Promise<string>` — returns session id
  - `getOrCreateSession(sessionId: string | undefined, channel, channelUserId): Promise<string>`
  - `appendMessage(sessionId, role: "user" | "assistant" | "system", content): Promise<void>`
  - `loadRecentMessages(sessionId, limit = 12): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>>`
  - `updateSessionStage(sessionId, stage: string | null): Promise<void>`

- [ ] **Step 1: Write the failing integration test**

`tests/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  appendMessage,
  getOrCreateSession,
  loadRecentMessages,
} from "@/lib/conversation/session";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("session persistence", () => {
  it("creates session and round-trips messages", async () => {
    const id = await getOrCreateSession(undefined, "web", "test-user");
    await appendMessage(id, "user", "hello");
    await appendMessage(id, "assistant", "hi there");
    const msgs = await loadRecentMessages(id, 12);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[0].content).toBe("hello");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL='mysql://vi:vi@127.0.0.1:3306/vi_chatbot' npm test -- tests/session.test.ts`  
Expected: FAIL — module not found or function missing

- [ ] **Step 3: Write minimal implementation**

`lib/conversation/session.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { ChannelName } from "@/lib/channels/types";
import { getDb } from "@/lib/db/client";
import { messages, sessions } from "@/lib/db/schema";

export async function createSession(
  channel: ChannelName,
  channelUserId: string,
): Promise<string> {
  const id = randomUUID();
  const db = getDb();
  await db.insert(sessions).values({ id, channel, channelUserId });
  return id;
}

export async function getOrCreateSession(
  sessionId: string | undefined,
  channel: ChannelName,
  channelUserId: string,
): Promise<string> {
  if (!sessionId) return createSession(channel, channelUserId);
  const db = getDb();
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (rows.length === 0) return createSession(channel, channelUserId);
  return sessionId;
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
): Promise<void> {
  const db = getDb();
  await db.insert(messages).values({ sessionId, role, content });
}

export async function loadRecentMessages(
  sessionId: string,
  limit = 12,
): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> {
  const db = getDb();
  const rows = await db
    .select({
      role: messages.role,
      content: messages.content,
      id: messages.id,
    })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.id));
  return rows.slice(-limit).map(({ role, content }) => ({ role, content }));
}

export async function updateSessionStage(
  sessionId: string,
  stage: string | null,
): Promise<void> {
  const db = getDb();
  await db.update(sessions).set({ stage }).where(eq(sessions.id, sessionId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL='mysql://vi:vi@127.0.0.1:3306/vi_chatbot' npm test -- tests/session.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/conversation/session.ts tests/session.test.ts
git commit -m "$(cat <<'EOF'
feat: persist chat sessions and recent messages in MySQL

EOF
)"
```

---

### Task 6: Knowledge loader + Palisade KB (TDD)

**Files:**
- Create: `lib/knowledge/palisade.json`, `lib/knowledge/loader.ts`
- Test: `tests/knowledge-loader.test.ts`

**Interfaces:**
- Consumes: none (reads JSON from disk/import)
- Produces: `loadKnowledgeContext(userText: string): string` — always includes model prices block; adds ADAS/comfort/dimensions sections when keywords match

- [ ] **Step 1: Write failing tests**

`tests/knowledge-loader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadKnowledgeContext } from "@/lib/knowledge/loader";

describe("loadKnowledgeContext", () => {
  it("always includes Exclusive price", () => {
    const ctx = loadKnowledgeContext("xin chào");
    expect(ctx).toContain("Exclusive");
    expect(ctx).toContain("1.469");
  });

  it("includes ADAS when asked", () => {
    const ctx = loadKnowledgeContext("xe có ga tự động thích ứng không?");
    expect(ctx.toLowerCase()).toMatch(/adas|ga tự động|điểm mù/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge-loader.test.ts`  
Expected: FAIL

- [ ] **Step 3: Author KB + loader**

`lib/knowledge/palisade.json` (content from req — keep exact reference prices):

```json
{
  "product": "Hyundai Palisade",
  "disclaimer": "Giá và thông số mang tính tham khảo cho demo.",
  "models": {
    "exclusive": {
      "price": "1.469 tỷ",
      "engine": "2.2L Diesel / 2.5L Turbo",
      "seats": "7"
    },
    "prestige": {
      "price": "1.559 tỷ",
      "engine": "2.2L Diesel / 2.5L Turbo",
      "seats": "6-7"
    },
    "caligraphy": {
      "price": "1.560 tỷ",
      "engine": "2.5L Turbo",
      "seats": "6-7"
    },
    "hybrid": {
      "price": "~1.65-2.1 tỷ",
      "engine": "2.5L Hybrid (334 HP)",
      "seats": "6-7"
    }
  },
  "features": {
    "adas": [
      "ga tự động thích ứng",
      "hỗ trợ giữ làn",
      "phanh khẩn cấp tự động",
      "cảnh báo điểm mù",
      "camera 360°"
    ],
    "comfort": [
      "ghế da Nappa sưởi/làm mát",
      "điều hòa 3 vùng",
      "cốp điện thông minh",
      "panoramic sunroof"
    ],
    "infotainment": [
      "màn hình kép 12.3 inch",
      "HUD",
      "âm thanh Bose",
      "kết nối smartphone"
    ]
  },
  "dimensions": {
    "length": "4995-5060 mm",
    "width": "1975-1980 mm",
    "height": "1785-1805 mm",
    "wheelbase": "2900-2970 mm"
  },
  "lifestyleHints": [
    {
      "tags": ["gia đình", "đà lạt", "roadtrip", "7 chỗ"],
      "blurb": "Gia đình đông người / đi tỉnh: ưu tiên không gian, ghế sưởi/làm mát, điều hòa 3 vùng — thường hợp Prestige 7 chỗ."
    }
  ]
}
```

`lib/knowledge/loader.ts`:

```ts
import kb from "@/lib/knowledge/palisade.json";

function modelsBlock(): string {
  const lines = Object.entries(kb.models).map(
    ([name, m]) =>
      `- ${name}: giá ${m.price}; động cơ ${m.engine}; chỗ ngồi ${m.seats}`,
  );
  return [`Sản phẩm: ${kb.product}`, kb.disclaimer, "Phiên bản:", ...lines].join(
    "\n",
  );
}

export function loadKnowledgeContext(userText: string): string {
  const t = userText.toLowerCase();
  const parts = [modelsBlock()];

  if (/adas|an toàn|ga tự động|điểm mù|phanh|làn|camera/.test(t)) {
    parts.push(`ADAS: ${kb.features.adas.join(", ")}`);
  }
  if (/ghế|điều hòa|sunroof|cốp|thoải mái|nappa/.test(t)) {
    parts.push(`Comfort: ${kb.features.comfort.join(", ")}`);
  }
  if (/màn hình|hud|bose|infotainment|giải trí/.test(t)) {
    parts.push(`Infotainment: ${kb.features.infotainment.join(", ")}`);
  }
  if (/kích thước|dài|rộng|cao|mm|wheelbase/.test(t)) {
    parts.push(
      `Kích thước DxRxC: ${kb.dimensions.length} x ${kb.dimensions.width} x ${kb.dimensions.height}; trục cơ sở ${kb.dimensions.wheelbase}`,
    );
  }
  for (const hint of kb.lifestyleHints) {
    if (hint.tags.some((tag) => t.includes(tag))) {
      parts.push(`Lifestyle: ${hint.blurb}`);
    }
  }
  return parts.join("\n\n");
}
```

Ensure `tsconfig.json` has `"resolveJsonModule": true`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge-loader.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/knowledge tests/knowledge-loader.test.ts
git commit -m "$(cat <<'EOF'
feat: add Palisade curated knowledge loader

EOF
)"
```

---

### Task 7: LLM port + OpenAI provider

**Files:**
- Create: `lib/llm/types.ts`, `lib/llm/openai.ts`, `lib/llm/index.ts`
- Test: `tests/llm-factory.test.ts` (no network)

**Interfaces:**
- Consumes: `OPENAI_API_KEY`, `OPENAI_MODEL`, `LLM_PROVIDER`
- Produces:
  - `type ChatMessage = { role: "system" | "user" | "assistant"; content: string }`
  - `interface LlmProvider { chat(messages: ChatMessage[]): Promise<string> }`
  - `getLlmProvider(): LlmProvider`
  - `createOpenAiProvider(opts?: { apiKey?: string; model?: string }): LlmProvider`

- [ ] **Step 1: Install OpenAI SDK**

```bash
npm install openai
```

- [ ] **Step 2: Write failing factory test**

`tests/llm-factory.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getLlmProvider } from "@/lib/llm";

describe("getLlmProvider", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it("throws when openai selected without key", () => {
    process.env.LLM_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    expect(() => getLlmProvider()).toThrow(/OPENAI_API_KEY/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/llm-factory.test.ts`  
Expected: FAIL

- [ ] **Step 4: Implement LLM modules**

`lib/llm/types.ts`:

```ts
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LlmProvider {
  chat(messages: ChatMessage[]): Promise<string>;
}
```

`lib/llm/openai.ts`:

```ts
import OpenAI from "openai";
import type { ChatMessage, LlmProvider } from "@/lib/llm/types";

export function createOpenAiProvider(opts?: {
  apiKey?: string;
  model?: string;
}): LlmProvider {
  const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = opts?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  return {
    async chat(messages: ChatMessage[]): Promise<string> {
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (!text) throw new Error("Empty LLM response");
      return text;
    },
  };
}
```

`lib/llm/index.ts`:

```ts
import { createOpenAiProvider } from "@/lib/llm/openai";
import type { LlmProvider } from "@/lib/llm/types";

export type { ChatMessage, LlmProvider } from "@/lib/llm/types";

export function getLlmProvider(): LlmProvider {
  const provider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
  if (provider === "openai") return createOpenAiProvider();
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/llm-factory.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/llm tests/llm-factory.test.ts package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: add LLM provider port with OpenAI default

EOF
)"
```

---

### Task 8: Leads service + notify hook (TDD)

**Files:**
- Create: `lib/leads/service.ts`, `lib/leads/notify.ts`
- Test: `tests/leads-service.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `leads` table, session id
- Produces:
  - `upsertLeadForSession(args: { sessionId: string; phone: string; summary: string; meta?: Record<string, unknown> }): Promise<{ id: number; created: boolean }>`
  - `listLeads(): Promise<Array<{ id: number; sessionId: string; phone: string; summary: string | null; createdAt: Date }>>`
  - `getLeadWithMessages(leadId: number): Promise<{ lead: ...; messages: ... } | null>`
  - `notifyLead(lead: { id: number; phone: string; sessionId: string }): Promise<void>` — no-op

- [ ] **Step 1: Write failing tests**

`tests/leads-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getOrCreateSession, appendMessage } from "@/lib/conversation/session";
import {
  getLeadWithMessages,
  listLeads,
  upsertLeadForSession,
} from "@/lib/leads/service";
import { notifyLead } from "@/lib/leads/notify";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("leads service", () => {
  it("upserts one lead per session and lists it", async () => {
    const sessionId = await getOrCreateSession(undefined, "web", "lead-user");
    await appendMessage(sessionId, "user", "0901234567");
    const first = await upsertLeadForSession({
      sessionId,
      phone: "0901234567",
      summary: "quan tâm Prestige",
    });
    const second = await upsertLeadForSession({
      sessionId,
      phone: "0912345678",
      summary: "đổi số",
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    const listed = await listLeads();
    expect(listed.some((l) => l.id === first.id && l.phone === "0912345678")).toBe(
      true,
    );

    const detail = await getLeadWithMessages(first.id);
    expect(detail?.messages.length).toBeGreaterThan(0);

    await expect(
      notifyLead({ id: first.id, phone: "0912345678", sessionId }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL='mysql://vi:vi@127.0.0.1:3306/vi_chatbot' npm test -- tests/leads-service.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement**

`lib/leads/notify.ts`:

```ts
export async function notifyLead(_lead: {
  id: number;
  phone: string;
  sessionId: string;
}): Promise<void> {
  // ponytail: no-op until Slack/email wired via env
}
```

`lib/leads/service.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { leads, messages } from "@/lib/db/schema";
import { notifyLead } from "@/lib/leads/notify";

export async function upsertLeadForSession(args: {
  sessionId: string;
  phone: string;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<{ id: number; created: boolean }> {
  const db = getDb();
  const existing = await db
    .select()
    .from(leads)
    .where(eq(leads.sessionId, args.sessionId))
    .limit(1);

  if (existing.length === 0) {
    const result = await db.insert(leads).values({
      sessionId: args.sessionId,
      phone: args.phone,
      summary: args.summary,
      meta: args.meta ?? null,
    });
    const id = Number(result[0].insertId);
    await notifyLead({ id, phone: args.phone, sessionId: args.sessionId });
    return { id, created: true };
  }

  const id = existing[0].id;
  await db
    .update(leads)
    .set({
      phone: args.phone,
      summary: args.summary,
      meta: args.meta ?? existing[0].meta,
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

Note: If Drizzle mysql insertId typing differs, adjust to the project’s drizzle version (`result[0].insertId` or `$returningId()`). Tests must assert a numeric `id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL='mysql://vi:vi@127.0.0.1:3306/vi_chatbot' npm test -- tests/leads-service.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/leads tests/leads-service.test.ts
git commit -m "$(cat <<'EOF'
feat: add lead upsert service and notify stub

EOF
)"
```

---

### Task 9: System prompt + ConversationEngine

**Files:**
- Create: `prompts/system.md`, `prompts/fewshots.md`, `lib/conversation/engine.ts`, `lib/conversation/prompt.ts`
- Test: `tests/engine.test.ts` (mock LLM)

**Interfaces:**
- Consumes: session helpers, `loadKnowledgeContext`, `getLlmProvider` (injectable), `extractVnPhone`, `upsertLeadForSession`
- Produces: `handleTurn(input: IncomingMessage, deps?: { llm?: LlmProvider }): Promise<OutgoingMessage>`
  - On LLM throw: return friendly Vietnamese fallback; still persist user message; `leadCaptured: false` unless phone extracted from user text (still upsert lead if phone present)

- [ ] **Step 1: Write prompts**

`prompts/system.md`:

```md
Bạn là Virtual Influencer — "người bạn am hiểu xe" (car-savvy bestie), đang chat về Hyundai Palisade.

【PERSONALITY】
- Thân thiện, gần gũi, tiếng Việt tự nhiên, câu ngắn.
- Không đóng vai nhân viên bán hàng Hyundai, CSKH, hay chatbot thương hiệu.
- Không bịa thông số/giá ngoài khối KNOWLEDGE.

【CONVERSATION FLOW】
1) Lắng nghe nhu cầu/lifestyle
2) Gợi ý tính năng theo lợi ích đời thường
3) Khi thấy quan tâm mua/lái thử → chủ động đề xuất lái thử
4) Thu thập số điện thoại để đăng ký lái thử
5) Sau khi có SĐT → xác nhận ấm áp, vẫn sẵn sàng trả lời thêm

【RULES】
- Giá mang tính tham khảo.
- Nhớ và nhắc lại chi tiết user đã nói.
- Emoji vừa phải.
```

`prompts/fewshots.md` (short — 1 example exchange matching the req tone).

`lib/conversation/prompt.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadKnowledgeContext } from "@/lib/knowledge/loader";

export function buildSystemPrompt(userText: string): string {
  const root = process.cwd();
  const system = readFileSync(path.join(root, "prompts/system.md"), "utf8");
  const few = readFileSync(path.join(root, "prompts/fewshots.md"), "utf8");
  const kb = loadKnowledgeContext(userText);
  return `${system}\n\n【KNOWLEDGE】\n${kb}\n\n【FEWSHOTS】\n${few}`;
}
```

- [ ] **Step 2: Write failing engine test with mock LLM**

`tests/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { handleTurn } from "@/lib/conversation/engine";
import type { LlmProvider } from "@/lib/llm/types";

const hasDb = Boolean(process.env.DATABASE_URL);

const mockLlm: LlmProvider = {
  async chat() {
    return "Ok chị ơi, em ghi nhận nha!";
  },
};

describe.skipIf(!hasDb)("handleTurn", () => {
  it("returns sessionId and reply", async () => {
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user",
        text: "Palisade có gì hay?",
      },
      { llm: mockLlm },
    );
    expect(out.sessionId).toBeTruthy();
    expect(out.text).toContain("Ok chị");
    expect(out.leadCaptured).toBe(false);
  });

  it("captures lead when user sends phone", async () => {
    const out = await handleTurn(
      {
        channel: "web",
        channelUserId: "engine-user-2",
        text: "Số mình 0901234567",
      },
      { llm: mockLlm },
    );
    expect(out.leadCaptured).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `DATABASE_URL='mysql://vi:vi@127.0.0.1:3306/vi_chatbot' npm test -- tests/engine.test.ts`  
Expected: FAIL

- [ ] **Step 4: Implement engine**

`lib/conversation/engine.ts`:

```ts
import type { IncomingMessage, OutgoingMessage } from "@/lib/channels/types";
import { extractVnPhone } from "@/lib/conversation/intent";
import { buildSystemPrompt } from "@/lib/conversation/prompt";
import {
  appendMessage,
  getOrCreateSession,
  loadRecentMessages,
} from "@/lib/conversation/session";
import { upsertLeadForSession } from "@/lib/leads/service";
import { getLlmProvider, type LlmProvider } from "@/lib/llm";

const FALLBACK =
  "Úi vừa đơ một nhịp, chị nhắn lại giúp em với nha — em vẫn ở đây!";

export async function handleTurn(
  input: IncomingMessage,
  deps?: { llm?: LlmProvider },
): Promise<OutgoingMessage> {
  const sessionId = await getOrCreateSession(
    input.sessionId,
    input.channel,
    input.channelUserId,
  );
  await appendMessage(sessionId, "user", input.text);

  const phone = extractVnPhone(input.text);
  let leadCaptured = false;
  if (phone) {
    await upsertLeadForSession({
      sessionId,
      phone,
      summary: `Lead từ hội thoại (${input.channel})`,
    });
    leadCaptured = true;
  }

  const history = await loadRecentMessages(sessionId, 12);
  const llm = deps?.llm ?? getLlmProvider();
  let reply: string;
  try {
    reply = await llm.chat([
      { role: "system", content: buildSystemPrompt(input.text) },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ]);
  } catch {
    reply = FALLBACK;
  }

  await appendMessage(sessionId, "assistant", reply);
  return { sessionId, text: reply, leadCaptured };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL='mysql://vi:vi@127.0.0.1:3306/vi_chatbot' npm test -- tests/engine.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add prompts lib/conversation/engine.ts lib/conversation/prompt.ts tests/engine.test.ts
git commit -m "$(cat <<'EOF'
feat: add conversation engine with prompt and lead capture

EOF
)"
```

---

### Task 10: `POST /api/chat` route

**Files:**
- Create: `app/api/chat/route.ts`
- Test: `tests/api-chat.test.ts` using route handler directly (or vitest + Request)

**Interfaces:**
- Consumes: `parseWebChatBody`, `handleTurn`
- Produces: HTTP JSON `{ sessionId, reply, leadCaptured }`
  - 400 on validation error
  - 503 if error message includes `DATABASE_URL` or MySQL connection failure
  - 200 otherwise

- [ ] **Step 1: Write failing test**

`tests/api-chat.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/conversation/engine", () => ({
  handleTurn: vi.fn(async () => ({
    sessionId: "abc",
    text: "hello",
    leadCaptured: false,
  })),
}));

import { POST } from "@/app/api/chat/route";

describe("POST /api/chat", () => {
  it("returns 400 for empty message", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns reply payload", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi", channelUserId: "u1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      sessionId: "abc",
      reply: "hello",
      leadCaptured: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api-chat.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement route**

`app/api/chat/route.ts`:

```ts
import { parseWebChatBody } from "@/lib/channels/web";
import { handleTurn } from "@/lib/conversation/engine";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseWebChatBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const out = await handleTurn(parsed.value);
    return Response.json({
      sessionId: out.sessionId,
      reply: out.text,
      leadCaptured: out.leadCaptured,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status =
      /DATABASE_URL|ECONNREFUSED|mysql/i.test(msg) ? 503 : 500;
    return Response.json({ error: "Chat unavailable" }, { status });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/api-chat.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/route.ts tests/api-chat.test.ts
git commit -m "$(cat <<'EOF'
feat: add POST /api/chat web channel endpoint

EOF
)"
```

---

### Task 11: Web chat UI (Messenger-like)

**Files:**
- Modify: `app/page.tsx`, `app/globals.css`, `app/layout.tsx`
- Create: `app/components/Chat.tsx` (client component)

**Interfaces:**
- Consumes: `POST /api/chat` JSON contract from Task 10
- Produces: browser UI storing `sessionId` in `localStorage` key `vi_chat_session_id`

- [ ] **Step 1: Implement client Chat component**

`app/components/Chat.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "vi_chat_session_id";

export function Chat() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) setSessionId(existing);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          channelUserId: "web-browser",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi gửi tin");
      localStorage.setItem(STORAGE_KEY, data.sessionId);
      setSessionId(data.sessionId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply as string },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <strong>Pali</strong>
        <span>car-savvy bestie · Palisade</span>
      </header>
      <div className="chat-thread">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading ? <div className="bubble assistant">...</div> : null}
      </div>
      {error ? <p className="chat-error">{error}</p> : null}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhắn gì đó..."
          maxLength={2000}
        />
        <button type="submit" disabled={loading}>
          Gửi
        </button>
      </form>
    </div>
  );
}
```

Style `app/globals.css` with a simple Messenger-like column (blue user bubbles, gray assistant), full-height mobile-friendly layout. Keep it demo-clean — not a Meta clone.

`app/page.tsx`:

```tsx
import { Chat } from "@/app/components/Chat";

export default function HomePage() {
  return (
    <main>
      <Chat />
      <p className="disclaimer">
        Demo Virtual Influencer — giá/thông số tham khảo, không phải tổng đài
        Hyundai.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Manual test**

Run MySQL + `npm run dev` with valid `OPENAI_API_KEY` and `DATABASE_URL`.  
Send two messages; refresh page; confirm `localStorage` keeps `sessionId` and conversation continues with context.

- [ ] **Step 3: Commit**

```bash
git add app/components/Chat.tsx app/page.tsx app/globals.css app/layout.tsx
git commit -m "$(cat <<'EOF'
feat: add Messenger-like web chat UI

EOF
)"
```

---

### Task 12: Admin leads UI

**Files:**
- Create: `app/admin/leads/page.tsx`, `app/api/admin/leads/route.ts`, `app/api/admin/leads/[id]/route.ts`
- Test: `tests/admin-auth.test.ts` for header secret check

**Interfaces:**
- Consumes: `listLeads`, `getLeadWithMessages`, `ADMIN_SECRET`
- Produces:
  - `GET /api/admin/leads` requires header `x-admin-secret: $ADMIN_SECRET` → 401 if missing/wrong
  - Admin page: client fetch with secret from prompt/localStorage for demo (document in README — not production IAM)

- [ ] **Step 1: Write failing auth test**

`tests/admin-auth.test.ts`:

```ts
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
```

- [ ] **Step 2: Implement API + page**

`app/api/admin/leads/route.ts`:

```ts
import { listLeads } from "@/lib/leads/service";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get("x-admin-secret") !== secret) {
    return unauthorized();
  }
  const rows = await listLeads();
  return Response.json({ leads: rows });
}
```

`app/api/admin/leads/[id]/route.ts`: similarly check secret; call `getLeadWithMessages(Number(id))`; 404 if null.

`app/admin/leads/page.tsx`: client component listing leads (phone, summary, createdAt); click row loads detail messages. Ask for admin secret once, store in `sessionStorage` key `vi_admin_secret`.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/admin-auth.test.ts`  
Expected: PASS

Manual: capture a phone via chat → open `/admin/leads` → see lead (criterion #7).

- [ ] **Step 4: Commit**

```bash
git add app/admin app/api/admin tests/admin-auth.test.ts
git commit -m "$(cat <<'EOF'
feat: add admin leads API and UI gated by ADMIN_SECRET

EOF
)"
```

---

### Task 13: Messenger stub + next-steps doc

**Files:**
- Create: `lib/channels/messenger.ts`, `app/api/messenger/webhook/route.ts`, `docs/messenger-next-steps.md`
- Test: `tests/messenger-stub.test.ts`

**Interfaces:**
- Consumes: channel types
- Produces:
  - `normalizeMessengerMessage(payload: unknown): IncomingMessage | null` — stub that returns null unless a minimal fake shape `{ sender: { id }, message: { text } }` is provided
  - Webhook `GET` returns hub.challenge when `hub.verify_token` equals `MESSENGER_VERIFY_TOKEN` (optional env)
  - Webhook `POST` returns 501 JSON `{ error: "Messenger send not implemented in v1" }` after optional normalize (do not call Send API)

- [ ] **Step 1: Write failing stub test**

```ts
import { describe, expect, it } from "vitest";
import { normalizeMessengerMessage } from "@/lib/channels/messenger";

describe("normalizeMessengerMessage", () => {
  it("maps minimal fake payload", () => {
    const msg = normalizeMessengerMessage({
      sender: { id: "fb_1" },
      message: { text: "hello" },
    });
    expect(msg).toEqual({
      channelUserId: "fb_1",
      channel: "messenger",
      text: "hello",
    });
  });

  it("returns null for garbage", () => {
    expect(normalizeMessengerMessage({})).toBeNull();
  });
});
```

- [ ] **Step 2: Implement stub + docs**

Implement `normalizeMessengerMessage` as above (no `sessionId`).

Webhook route: GET challenge echo; POST 501.

`docs/messenger-next-steps.md`: list Meta App, Page token, HTTPS, map webhook → `handleTurn` → Send API; remind reuse `ConversationEngine`.

- [ ] **Step 3: Run tests + commit**

```bash
npm test -- tests/messenger-stub.test.ts
git add lib/channels/messenger.ts app/api/messenger docs/messenger-next-steps.md tests/messenger-stub.test.ts
git commit -m "$(cat <<'EOF'
feat: add Messenger channel stub and next-steps doc

EOF
)"
```

---

### Task 14: Demo eval checklist + final verification

**Files:**
- Create: `docs/demo-eval-checklist.md`, `docs/eval-scripts/family-dalat.md`

**Interfaces:**
- Consumes: running app
- Produces: signed-off checklist mapped to 7 criteria

- [ ] **Step 1: Write eval script**

`docs/eval-scripts/family-dalat.md` — exact user lines:

1. `Xe Palisade có gì hay vậy?`
2. `Nhà mình 5 người, hay đi Đà Lạt`
3. `Nghe hấp dẫn quá, giá bao nhiêu?`
4. (Expect AI offers test drive + asks phone)
5. `0901234567`

Pass criteria notes for tone, KB prices, memory of 5 người/Đà Lạt, lead in admin.

- [ ] **Step 2: Write checklist**

`docs/demo-eval-checklist.md` with the 7 criteria checkboxes + edge case “phone on turn 1”.

- [ ] **Step 3: Run full automated suite**

```bash
DATABASE_URL='mysql://vi:vi@127.0.0.1:3306/vi_chatbot' npm test
```

Expected: all non-skipped tests PASS.

- [ ] **Step 4: Manual eval against checklist; fix prompt only if needed (small commit)**

If tone/salesy: edit `prompts/system.md` / `fewshots.md` only — no architecture changes.

- [ ] **Step 5: Commit docs**

```bash
git add docs/demo-eval-checklist.md docs/eval-scripts
git commit -m "$(cat <<'EOF'
docs: add demo eval script and 7-criteria checklist

EOF
)"
```

---

## Self-review

### Spec coverage

| Spec item | Task |
|-----------|------|
| Web Messenger-like UI | 11 |
| Influencer personality prompt | 9 |
| Product KB accuracy | 6, 9, 14 |
| Contextual memory (last N) | 5, 9 |
| Need-based suggestions | 6 lifestyleHints + 9 prompt |
| Lead conversion ask phone | 9 prompt flow |
| Lead confirm admin | 8, 12 |
| Next.js modular monolith | 1, 9–11 |
| MySQL | 4–5, 8 |
| LLM abstraction default OpenAI | 7 |
| notify stub | 8 |
| Messenger later path | 13 |
| VN phone extract | 2 |
| API validation / errors | 3, 10 |

### Placeholder scan

No TBD/TODO-as-work-steps remain in task bodies; Messenger Send API explicitly stubbed with 501.

### Type consistency

- `IncomingMessage` / `OutgoingMessage` defined Task 3; used by engine (9), API (10), messenger stub (13).
- `handleTurn` → `{ sessionId, text, leadCaptured }`; API maps `text` → `reply`.
- `LlmProvider.chat(messages)` used by engine with injectable mock.
- Lead upsert returns `{ id, created }`; admin lists full rows.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-12-vi-chatbot.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
