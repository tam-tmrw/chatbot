---
name: huggies-flow
description: Safely modify the Huggies pitch demo — the flow/guide dual-mode state machine, step transitions, LLM extraction and fallbacks, photo QC, gender video pools, and copy. Use for any change under lib/huggies/ or app/huggies/ or the /api/huggies routes.
---

# Huggies flow changes

The `/huggies` demo is the highest-risk, highest-churn area of this repo. Regressions here
are behavioral, not compile-time — the test suite is the only automated safety net.

## Read these first

- `docs/superpowers/specs/2026-11-10-huggies-dual-mode-design.md`
- `docs/superpowers/specs/2026-11-10-huggies-guide-hard-info-design.md`
- `lib/huggies/types.ts` — the `Session`, `StepId`, `TurnInput`, `TurnResult` contracts

## The two engines

Both operate on the same in-memory `Session` and must stay behaviorally compatible:

- **Flow** — `applyTurn()` → optional LLM extract → `applyRigid()`. Deterministic core.
- **Guide** — `applyGuideTurn()` → LLM JSON → validate → merge → exit/photo/confirm gates.

`applyTurn` and `applyGuideTurn` never share mutable state; they clone the session.

## Procedure

1. **Locate the step.** Steps live in `StepId` (`types.ts`) and are handled in the
   `switch (session.step)` inside `applyRigid()`. Ordering of collected fields lives in
   `nextIncomplete()` and `COLLECT` — change both together.
2. **Decide the layer.** Copy-only change → `copy.ts`. Parsing → `validate.ts` / `gender.ts`.
   Flow control → `machine.ts`. Guide control → `agent.ts`. Never put I/O in the pure files.
3. **Preserve the invariants** listed in `AGENTS.md` §5. In particular:
   - new LLM call ⇒ new timeout + static Vietnamese fallback;
   - a new gate that must always run ⇒ put it on the rigid path, not the LLM path;
   - never let a gender-specific pool leak into the other gender.
4. **Extend deps, don't import.** New side effects go through `MachineDeps` / `GuideDeps`
   (`env.ts`) so tests can inject fakes.
5. **Test at the seam that changed:**
   - step logic → `tests/huggies-machine.test.ts`
   - guide agent → `tests/huggies-agent.test.ts`
   - extraction/LLM → `tests/huggies-ai.test.ts`
   - routing → `tests/huggies-api.test.ts`
   - gender pools → `tests/huggies-gender-pool.test.ts`
   - copy/rules → `tests/huggies-rules.test.ts`

   Construct sessions with `freshSession({ mode })` and pass fake deps. **No network calls
   in tests.**
6. **Verify:** `npm run check`, then `npm run build`, then click through `/huggies` in both
   modes (Channel × Mode change must create a *new* session).

## Copy rules

- User-facing strings are **Vietnamese only**, warm second-person ("Ba mẹ").
- Keep icons/formatting consistent with `copy.ts`; do not invent a new voice.
- English status/error strings are internal only (`errorCode`, logs).

## Common traps

- Editing the `ai` flag directly — it is derived from `mode`; change `mode`.
- Making a hint replace the full prompt so the user loses their place (see the
  "one soft tip only" comment in `applyTurn`).
- Adding a step without updating `COLLECT`, `nextIncomplete`, `promptFor`, and the
  `STEP_FIELD` map.
- Treating a Rekognition `awsError` as a hard failure — check `HUGGIES_REKOGNITION_SOFT`.
