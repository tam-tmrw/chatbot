---
name: verify
description: Run the full local verification gate for this repo — typecheck, lint, tests, and optionally production build — and report a truthful pass/fail summary. Use before claiming a change is done, before committing, or when asked to check the project builds.
---

# Verify

This repo has **no CI**. `npm run check` is the gate, and it is only meaningful if you
report it honestly.

## The gate

```bash
npm run check
```

That runs, in order:

1. `npm run typecheck` → `tsc --noEmit`
2. `npm run lint` → `eslint` (must be **0 errors**; warnings are tolerated)
3. `npm test` → `vitest run`

## Expected healthy output

```
Test Files  25 passed | 4 skipped (29)
     Tests  123 passed | 16 skipped (139)
```

**16 skipped tests are normal** — they need MySQL (`DATABASE_URL` unreachable). Do not
"fix" or delete them, and do not report them as failures.

If you *do* have MySQL available, you can exercise them with a reachable `DATABASE_URL`;
counts will then be higher. Mention which state you tested in.

## When to add the build

Run the production build when you touched anything under `app/`, JSX/TSX, styling, or
routing — type checking does not catch every Next.js build error:

```bash
npm run build
```

It should end with a route table and exit 0. On failure, fix before reporting.

## Report format

State, explicitly:

- each command and its real exit status;
- whether skips are the expected MySQL ones;
- anything you could **not** verify (e.g. no browser, no API key, no DB), instead of
  implying it works.

Never claim green from a command you did not run. If a check fails for reasons unrelated to
your change, say so and show the pre-existing state (`git stash` is an option) rather than
silently suppressing it.
