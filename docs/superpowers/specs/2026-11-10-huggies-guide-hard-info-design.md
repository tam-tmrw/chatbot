# Huggies Guide — hard info for consent / hobby / confirm

**Date:** 2026-11-10  
**Status:** Approved design (approved)  
**Parent:** `2026-11-10-huggies-dual-mode-design.md`

## Problem

In **AI guide** mode the bot asked parents to “đồng ý Điều khoản” without showing what the terms are or where to read them. Questions like “điều khoản gì vậy” fell through to a generic “chưa nghe rõ” and jumped to the next field. Similar thin hints also under-specified **hobby** (ellipsis list) and **confirm** (name-only summary). Welcome still used Flow “gõ số” copy.

## Goals

1. Consent always includes a clear note + `HUGGIES_TERMS_URL` from `.env` before asking for “đồng ý”.
2. Terms questions stay on consent (re-send note + URL); never skip ahead.
3. Guide welcome is free-text (no numbered start).
4. Hobby hint lists every `HOBBIES` label; confirm shows a full field summary like Flow.

## Non-goals

- Hosting or authoring the T&C page (URL only).
- Changing Flow rigid consent (already sends `Điều khoản: ${termsUrl}`).
- New Messenger chips for Guide consent (text + URL is enough for pitch).
- Reworking displayName “keep name” UX beyond current affirmative merge.

## Design

### Consent hard gate

- Build a shared helper, e.g. `consentPrompt(termsUrl: string): string`, used by:
  - Guide first missing hint when `!fields.consent`
  - Guide replies when the user asks about terms / link / “xem điều khoản”
- Content (Vietnamese):
  1. Short purpose: ảnh chỉ dùng để tạo video theo điều khoản.
  2. `Điều khoản: ${termsUrl}` (`deps.termsUrl` ← `process.env.HUGGIES_TERMS_URL`, same as Flow).
  3. CTA: trả lời “đồng ý” để tiếp tục; không đồng ý → polite `end`.
- Detection: if `!consent` and user text matches terms inquiry (`dieu khoan`, `link`, `xem`, …) **and** is not affirmative consent → return `consentPrompt` only (no LLM).
- Affirmative / “đồng ý” still goes through existing `userConsents` (negation-safe).

### Welcome (Guide only)

- When `mode === "guide"`, session-open / welcome copy:
  - Greet + explain short Q&A in natural language.
  - **Do not** say “gõ số 1” / numbered start.
- Flow welcome unchanged.

### Hobby + confirm

- `firstMissingHint` / hobby string: join all `HOBBIES[].label` (comma-separated), no `…`.
- Guide confirm message: same fields as Flow summary — babyName, displayName, gender, ageRange, hobby label, photo received — then ask to confirm create.

### Wiring

| Piece | Change |
|-------|--------|
| `lib/huggies/checklist.ts` | Consent/hobby/confirm hints need `termsUrl` and/or fields context (pass args or thin wrappers from agent). |
| `lib/huggies/agent.ts` | Terms-inquiry short-circuit; use consent/confirm helpers; welcome path if agent owns first message. |
| `lib/huggies/copy.ts` or session route | Guide-specific welcome when creating session with `mode=guide`. |
| `.env` / `.env.example` | Keep `HUGGIES_TERMS_URL`; document that Guide reads it (no new env key). |
| Tests | Consent shows URL; terms question re-sends URL without advancing; hobby lists all labels; confirm has multi-field summary; Guide welcome has no “gõ 1”. |

## Decision log

| Decision | Choice | Why |
|----------|--------|-----|
| Approach | Hard gate (not LLM-only) | Demo must not depend on model to surface legal link |
| Terms source | Existing `HUGGIES_TERMS_URL` | One config for Flow + Guide |
| Scope | consent + welcome + hobby + confirm | Same class of “ask without info” bugs |

## Success criteria

- Guide user never sees “đồng ý Điều khoản” without the URL line.
- “điều khoản gì vậy” → note + URL, still on consent.
- Guide open message has no numbered-start instruction.
- Hobby ask enumerates full hobby labels; confirm lists all collected fields.
