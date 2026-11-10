# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo.
Any agent tool — Cursor, Claude Code, DeepSeek Harness, Copilot, Codex — should read this first.

---

## 1. What this project is

**VI Chatbot** — a Vietnamese-market virtual-influencer chatbot demo platform built on
Next.js 15 (App Router). It is a *demo/pitch* codebase, not a hardened product: several
auth and reliability paths are deliberately simplified. Trade-offs are documented inline
with `// ponytail:` comments — keep that convention.

It currently serves three surfaces from one app:

| Surface | Route | What it is |
| --- | --- | --- |
| Hyundai web chat | `/`, `/c/[sessionId]` | Lead-capture conversation with an LLM virtual influencer |
| **Huggies pitch demo** | `/huggies` | Interactive "make a video of your baby" funnel; **the main active work** |
| Admin leads | `/admin/leads` | Demo-gated lead table (`x-admin-secret`) |

Inbound channel adapters (web, Messenger, ManyChat) normalize into one channel-agnostic
conversation engine.

---

## 2. Stack

- **Next.js 15.5.23** — App Router, Turbopack, React 19.1, TypeScript 5 (`strict: true`)
- **Tailwind CSS v4** (PostCSS plugin, no tailwind.config.js)
- **Vitest 4** — node environment, `tests/**/*.test.ts`, `@/` alias to repo root
- **MySQL 8 + Drizzle ORM** (mysql2 driver); migrations in `drizzle/`
- **OpenAI SDK** behind a provider abstraction (`lib/llm/`)
- **AWS Rekognition** for photo QC on the Huggies flow

No CI is configured (.github absent). Verification is manual/local — see §6.

---

## 3. Repository map

```
app/                     Next.js routes
  api/chat/              Hyundai chat + session messages
  api/huggies/           Session / message / job — Huggies stateful API
  api/manychat/          ManyChat dynamic-block callback
  api/messenger/webhook  Messenger stub
  api/admin/leads/       Demo-gated lead API
  components/            Hyundai chat UI
  huggies/HuggiesChat.tsx  Huggies demo UI (large, ~570 lines)
lib/
  channels/              Inbound/outbound adapters: web, messenger, manychat
  conversation/          Channel-agnostic engine: engine, flow, intent, profile, prompt, session, bubbles
  llm/                   Provider factory + OpenAI impl (getLlmProvider())
  huggies/               Huggies demo domain — see §5 (this is where most work happens)
  leads/                 Lead persistence + notification
  db/                    Drizzle client + schema
  knowledge/             Static knowledge JSON (palisade.json) + loader
  web/                   Web chat session helpers
lib/demo-access.ts       Access-code gate for pitch demos
prompts/                 system.md + fewshots.md (Hyundai LLM prompts)
docs/                    Design docs; docs/superpowers/ holds specs + task-by-task plans
tests/                   Vitest suites (one per module concern)
drizzle/                 SQL migrations + journal
```

### Path alias

`@/*` → repo root. Always import as `@/lib/...`, never `../../lib/...`.

---

## 4. Commands

```bash
npm run dev          # next dev --turbopack  → http://localhost:3000
npm run build        # next build --turbopack
npm start            # serve built app
npm test             # vitest run        (~2.4s, 123 pass / 16 skipped)
npm run test:watch   # vitest
npm run lint         # eslint           (must stay at 0 errors)
npm run typecheck    # tsc --noEmit
npm run check        # typecheck + lint + test — run this before you claim "done"
npm run db:generate  # drizzle-kit generate
npm run db:migrate   # drizzle-kit migrate
npm run db:push      # drizzle-kit push
```

**Known-expected skips:** `db-smoke`, `leads-service`, `engine`, `session` suites skip
without MySQL. That is normal — do not "fix" it.

---

## 5. Huggies demo (`lib/huggies/`) — the active area

`/huggies` is a pitch demo with two **modes** on one in-memory `Session`:

- **`mode=flow`** — rigid state machine (`machine.ts::applyTurn`). Deterministic; light LLM
  extraction is optional and always has a non-LLM fallback.
- **`mode=guide`** — conversational agent (`agent.ts::applyGuideTurn`). LLM returns JSON,
  which is validated and merged. Hard gates (consent, terms, photo) never depend on the LLM.

Invariants that have caused real regressions — **do not break these**:

1. **LLM is never on the critical path.** Every LLM call has a timeout and a static
   Vietnamese fallback. A timeout must never strand the user mid-step.
2. **Consent is a hard gate.** Terms URL must be shown; explicit consent required;
   decline → `end`. No LLM involvement.
3. **Images never enter the LLM.** Photos go to Rekognition only.
4. **Vietnamese-only assistant copy.** No English leaking into user-facing strings.
5. **Never cross gender video pools.** `videoPoolForGender()` must not serve a boy video
   for a girl and vice versa. Falls back to the shared pool, then merged.
6. **Exit intent ends politely.** Guide mode does not drag an exiting user back.
7. **Field overwrite policy** (`mayOverwriteField`): only the current step's field, or an
   empty field, may be overwritten by LLM extraction.
8. **`HUGGIES_REKOGNITION_SOFT=1`** (default) accepts photos on AWS auth failure. Pitch
   resilience beats strictness here. Do not flip the default.

Env for this area: `HUGGIES_*` — see `.env.example`. All are read **dynamically**
(`process.env[name]`) to dodge Next.js build-time inlining; keep that pattern.

---

## 6. How to verify a change

Use `npm run check` (typecheck + lint + test). Additionally:

- **Conversation/state changes:** add or update a Vitest case. LLM calls in tests are
  injected/mocked (`deps.llm`, `deps.extract`, `deps.guideChat`) — never hit the network
  in tests.
- **UI changes:** `npm run build` must pass, then check `/huggies` and `/` in a browser.
- **DB changes:** update `lib/db/schema.ts`, run `db:generate`, commit the SQL + journal.

A change is not done until `npm run check` exits 0 **and** the diff contains no unrelated
refactors.

---

## 7. Engineering rules

- **Surgical diffs.** Change only what the task requires. No drive-by reformatting, no
  "while I'm here" refactors, no renaming across files.
- **Keep the seams.** `MachineDeps` / `GuideDeps` / injected `llm` exist for testability.
  Extend the deps object rather than adding module-level singletons or direct imports of
  `getLlmProvider()` inside pure logic.
- **Pure logic stays pure.** Files like `bubbles.ts`, `validate.ts`, `flow.ts`,
  `checklist.ts`, `machine.ts` must stay free of I/O — that is why they are cheap to test.
- **Match existing style.** No semicolon opinions changes, existing formatting, `async` for
  I/O only, prefer `type` imports (`import type`).
- **Session state is in memory.** Not durable across restarts. Do not assume persistence.
- **Secrets never go in the repo.** `.env*` is gitignored except `.env.example`. If you add
  a config value, add it to `.env.example` with a safe placeholder.

### Things that look like bugs but aren't

- 16 skipped tests (no MySQL locally) — see §4.
- Admin auth is `sessionStorage` + `x-admin-secret`; a documented demo gate, not real IAM.
- Rekognition "accept photo on AWS error" — deliberate (`HUGGIES_REKOGNITION_SOFT`).
- `.worktrees/` is an abandoned git worktree. **Never edit files under it**; it is
  gitignored and now lint-ignored. The repo root is the only source of truth.

---

## 8. Project skills

Reusable procedures live in `.agent/skills/<name>/SKILL.md` (Agent Skills format — usable
by Claude Code and other compatible tools, and readable by any agent):

| Skill | Use it when |
| --- | --- |
| `project-map` | You are new to the codebase and need orientation / to trace a request end-to-end |
| `huggies-flow` | You are changing `lib/huggies/*` or `/huggies` — mode, step, or copy logic |
| `verify` | Before you say a change is done, or before committing |

---

## 9. Docs to read before large work

- `docs/superpowers/specs/` — accepted designs (read the relevant one first)
- `docs/superpowers/plans/` — task-by-task implementation plans
- `docs/huggies-demo-design.md`, `docs/manychat-gateway-design.md` — subsystem design
- `graphify-out/GRAPH_REPORT.md` — generated module/community map (regenerate with
  `graphify update .` after structural changes; do not hand-edit)
