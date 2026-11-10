---
name: project-map
description: Orient in this Next.js 15 virtual-influencer chatbot repo and trace a request end-to-end across channels, conversation engines, LLM provider, and DB. Use when new to the codebase, when asked where something lives, or before touching a subsystem you have not read yet.
---

# Project map

Read `AGENTS.md` first — it holds the non-negotiable rules. This skill is the *navigation*
procedure for this specific repo.

## Step 1 — Confirm the baseline

```bash
npm run check
```

Expect `typecheck` clean, `lint` 0 errors, `test` 123 passed / 16 skipped. If you see
failures before you changed anything, report that instead of building on a broken tree.

## Step 2 — Pick the surface you are touching

| You need to change… | Start at | Then read |
| --- | --- | --- |
| Hyundai lead chat behavior | `lib/conversation/engine.ts` (`handleTurn`) | `conversation/prompt.ts`, `profile.ts`, `prompts/system.md` |
| Which channel a message came from | `lib/channels/types.ts` | `channels/web.ts`, `messenger.ts`, `manychat.ts` |
| Huggies funnel | `lib/huggies/machine.ts` + `agent.ts` | use the `huggies-flow` skill |
| Lead storage | `lib/leads/service.ts` | `lib/db/schema.ts`, `drizzle/` |
| LLM model / provider | `lib/llm/index.ts` (`getLlmProvider`) | `lib/llm/openai.ts`, `types.ts` |
| Admin leads UI/API | `app/admin/leads/page.tsx` | `app/api/admin/leads/*`, `lib/demo-access.ts` |
| Knowledge grounding | `lib/knowledge/loader.ts` | `lib/knowledge/palisade.json` |

## Step 3 — Trace one request end-to-end

Follow these seams in order; every conversion point is a `types.ts` boundary:

1. **Adapter** — `lib/channels/*` maps a transport payload to `IncomingMessage`.
2. **Route** — `app/api/*/route.ts` validates the request and picks the engine.
3. **Engine** — `conversation/engine.ts` (Hyundai) or `lib/huggies/*` (Huggies).
4. **LLM** — always via `getLlmProvider()` or an injected dep; never instantiate `OpenAI`.
5. **Persistence** — `lib/leads/service.ts` / `lib/huggies/store.ts` → Drizzle → MySQL.
6. **Response** — `OutgoingMessage` (`texts[]` bubbles + joined `text`) back through the adapter.

Writing this trace down before editing is the reliable way to avoid fixing the wrong layer.

## Step 4 — Find before you grep blindly

`graphify-out/GRAPH_REPORT.md` is a generated module/community map. Use it for a cheap
overview, then confirm in source — it can be stale. Refresh after structural changes:

```bash
graphify update .
```

## Reporting

When you summarize findings, cite real paths (`lib/huggies/machine.ts:534`) and line
numbers you actually read. Do not describe code you have not opened.
