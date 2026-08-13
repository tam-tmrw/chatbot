## Task 10 — Chat API 503 test

**Test:** `returns 503 when database unavailable` in `tests/api-chat.test.ts`

- Mocks `handleTurn` rejecting with `Error("DATABASE_URL is not set")`
- Valid POST body `{ message: "hi", channelUserId: "u1" }`
- Asserts status `503`, body `{ error: "Chat unavailable" }`

**Results:** `npm test -- tests/api-chat.test.ts` — 3 passed (3)
