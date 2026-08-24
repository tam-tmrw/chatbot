# Web session URL + history hydrate — Design

**Status:** Design validated (brainstorming lock)  
**Date:** 2026-08-24  
**Approach:** Option 1 — `/c/<sessionId>` + history API + 1 bubble = 1 DB row; lazy session until first message

---

## 1. Understanding summary

- **What:** Persist web chat continuity via URL `/c/<sessionId>`; hydrate messages from DB on revisit; default continue last session; explicit **Chat mới**.
- **Why:** Today DB already stores turns and `localStorage` keeps `sessionId`, but UI messages live only in React state — refresh looks like “lost chat.”
- **Who:** Same user / same machine (internal demo). Not a share-with-others product goal.
- **Constraints:** UUID = capability link (no auth); ~20 messages first page + scroll-up for older; session DB row only on first send; invalid `/c/<id>` → not-found + CTA.
- **Non-goals:** Auth/login; soft-gate URL↔localStorage; soft-delete/ended sessions; ManyChat URL changes; full SSR history pages.

---

## 2. Assumptions

| ID | Assumption |
|----|------------|
| S1 | Demo scale; UUID in URL is enough (no auth). |
| S2 | ManyChat keeps Dynamic Block multi-`messages[]`; engine writes N assistant rows same as web. |
| S3 | `GET` history paginates (`limit` default 20, `beforeId` cursor). |
| S4′ | One bubble = one `messages` row (user 1/turn; assistant N/turn). |
| S5 | Chat mới clears client + navigates `/`; no `createSession` until first POST. |
| S6 | Legacy joined assistant rows (`\n\n`) split on **read** for UI; no mandatory DB backfill in v1. |
| S7 | `OutgoingMessage.text` may still be joined for single-string consumers; DB writes use `texts[]` separately. |

---

## 3. Decision log

| # | Decision | Alternatives | Why |
|---|----------|--------------|-----|
| 1 | Restore for same user/machine | Share link | Matches stated goal A |
| 2 | Default continue + Chat mới | Always new session | Continuity + escape hatch |
| 3 | Chat mới: clear storage; old DB kept | Soft-delete / ended | Simple; old bookmark still works |
| 4 | Path `/c/<sessionId>` | Query `?s=` | Clear bookmarks; App Router fit |
| 5 | Unknown id → not-found + Chat mới | Auto-create / redirect `/` | No orphan sessions |
| 6 | UI ~20 + infinite scroll older | Full dump / only 12 | UX without heavy first paint |
| 7 | No auth (capability UUID) | Soft-gate / login | Demo-appropriate |
| 8 | 1 bubble = 1 DB row; lazy session | Join+split on read; create session on button | UI↔DB sync; no empty sessions |
| 9 | Architecture Option 1 | Opt 2 (join DB) / Opt 3 (SSR) | Correct intent, moderate scope |

---

## 4. Final design

### 4.1 Architecture & data flow

```
/                     → Chat pending (no session). If localStorage has id → replace /c/<id>
/c/<sessionId>        → Chat bound to id; GET first history page; sync localStorage
Chat mới              → removeItem(localStorage), messages=[], navigate `/` (no DB create)
POST /api/chat        → createSession if no/invalid sessionId; return sessionId
                      → client on `/`: set storage + replace `/c/<id>`
GET .../messages      → paginate; 404 if session missing
Engine                → append user once; append each assistant bubble as its own row
Legacy rows           → UI split on `\n\n+` when content looks joined (read-path only)
```

### 4.2 Components & API

**UI**
- `app/page.tsx` — unbound chat / localStorage redirect.
- `app/c/[sessionId]/page.tsx` — bound chat; not-found UI when session missing.
- `Chat.tsx` — `sessionId?`, hydrate, scroll-up load, Chat mới, post-first-message URL sync.

**APIs**

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/chat` | Unchanged contract (`sessionId`, `reply`, `replies`, …). `sessionId` optional. |
| `GET` | `/api/chat/sessions/[sessionId]/messages` | `limit` (default 20, cap ~50), `beforeId?`. Response: `{ messages: [{ id, role, content }], hasMore }`. 404 if no session. |

**Server**
- `loadMessagesPage(sessionId, { beforeId?, limit })`.
- `handleTurn`: loop `appendMessage` per bubble; stop writing a single joined assistant row.
- Keep `loadRecentMessages` for LLM context (now naturally multi-bubble rows).

**Client storage:** `vi_chat_session_id` — set from URL or POST; cleared on Chat mới.

### 4.3 Edge cases

| Case | Behavior |
|------|----------|
| `/` + valid stored id | Redirect `/c/<id>` + hydrate |
| `/` + stored id 404 | Clear storage; empty chat on `/` |
| `/c/<id>` missing | Not-found + Chat mới |
| First message on `/` | POST creates session → `/c/<id>` |
| Re-ask / fallback / nudge | Single assistant row |
| Scroll + `hasMore` | `beforeId` = oldest visible message id |

### 4.4 Errors

- GET 404 → not-found page (bound route) or clear storage on `/` redirect path.
- GET 500 → inline error; keep sessionId.
- Block send while initial hydrate in flight.

### 4.5 Testing

- Unit: `loadMessagesPage` pagination; engine N assistant inserts.
- API: GET 200/404; POST creates session without id.
- Manual: F5 restore; Chat mới → `/`; bookmark restore; scroll older.

### 4.6 Implementation sketch (files)

| Area | Touch |
|------|--------|
| `lib/conversation/session.ts` | `loadMessagesPage`; maybe `sessionExists` |
| `lib/conversation/engine.ts` | Multi `appendMessage` for assistant |
| `app/api/chat/sessions/[sessionId]/messages/route.ts` | New GET |
| `app/c/[sessionId]/page.tsx` | New page |
| `app/components/Chat.tsx` | Hydrate, scroll, Chat mới, URL sync |
| `app/page.tsx` | Wire redirect / Chat |
| Tests | session page load, API GET, engine multi-row |

---

## 5. Out of scope (v1)

- Auth / signed session tokens  
- Hard DB migration rewriting old joined rows  
- Sharing sessions as a product feature  
- Changing ManyChat callback URL shape  
