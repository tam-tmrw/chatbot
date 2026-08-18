# ManyChat gateway (Facebook Messenger) — Design

**Status:** Design validated (brainstorming lock)  
**Date:** 2026-08-18  
**Approach:** Dedicated ManyChat callback + Dynamic Block v2; keep web chat unchanged

---

## 1. Understanding summary

- **What:** ManyChat is the Facebook Page gateway. Default Reply POSTs every user **text** to our backend. `handleTurn` owns conversation + lead capture. Response is ManyChat **Dynamic Block v2** (text only) plus `external_message_callback` for later turns.
- **Why:** Fans chat the Page; we convert to sales-usable leads without forking the engine or owning Meta Send API.
- **Who:** Internal / pitch demo; team already on ManyChat.
- **Constraints:** Backend leads the whole dialogue; no quick replies; lead fields = name + region + finance + phone; LLM timeout ~8–10s + fallback; shared-secret header; demo scale (1 Page, no queue).
- **Non-goals (v1):** Meta webhook / Graph Send API go-live; ManyChat chips/buttons; Custom Field sync; rate limit; Redis/queue; merging ManyChat JSON into `POST /api/chat`.

---

## 2. Assumptions

| ID | Assumption |
|----|------------|
| M1 | ManyChat plan includes External Request / Dynamic Block; Page is connected. |
| M2 | Session key for FB = `(channel=messenger, channelUserId=ManyChat user_id)`. |
| M3 | Strip markdown before sending to Messenger (no web HTML). |
| M4 | Public HTTPS + `PUBLIC_BASE_URL` for callback URL. |
| M5 | Do not log raw PII (phone / user text) in production. |
| M6 | `OPENAI_API_KEY` must work; fallback is not the intended UX. |
| M7 | Port name/region/finance extract + validation from the newer web profile logic. |
| M8 | Hosting = any stable HTTPS for demo (Vercel or equivalent). |
| M9 | Eng provides callback URL + secret; whoever owns the ManyChat account turns Default Reply on. |
| M10 | Same person on web vs FB = two sessions (different channels). |

---

## 3. Decision log

| # | Decision | Alternatives considered | Why |
|---|----------|-------------------------|-----|
| 1 | ManyChat = FB gateway; backend owns dialogue | Hybrid menu; ManyChat forms for leads | Reuse `handleTurn` |
| 2 | Default Reply: every text → backend | Keyword / welcome then handoff | Least ManyChat config |
| 3 | No quick replies | Backend chips; ManyChat-fixed chips | Text-only Messenger |
| 4 | Lead: name + region + finance + phone | Phone-only; write ManyChat Custom Fields | Sales-usable record |
| 5 | LLM timeout ~8–10s + fixed fallback | Silent fail; ManyChat-only copy | Avoid hung Default Reply |
| 6 | Auth: `x-manychat-secret` | URL secrecy; rate limit | YAGNI for demo |
| 7 | Scale: internal demo, 1 Page | Pilot hundreds/day; queue | Match current v1 |
| 8 | Dedicated `/api/manychat/callback` | Wrap `/api/chat`; External Request → Custom Field → send | Separate contracts; keep web |
| 9 | Keep web UI + `POST /api/chat` | ManyChat-only | Stakeholder: both channels |

---

## 4. Final design

### 4.1 Architecture

```
[Web UI] ──POST /api/chat──► parseWebChatBody ──┐
                                                ├──► handleTurn ──► MySQL
[ManyChat Default Reply / external_message_callback]
        ──POST /api/manychat/callback──► parseManyChat ──┘
                                                └──► LLM (race vs 8–10s)
```

- Web response shape unchanged: `{ sessionId, reply, leadCaptured }`.
- ManyChat response: Dynamic Block v2 text + `external_message_callback` (same URL, secret header).
- Stub `POST /api/messenger/webhook` stays 501 (not the live FB path).

### 4.2 Components

| Piece | Action |
|-------|--------|
| `app/components/Chat.tsx`, `POST /api/chat` | Keep |
| `lib/channels/manychat.ts` | Parse ManyChat → `IncomingMessage`; `OutgoingMessage` → Dynamic Block; strip markdown |
| `POST /api/manychat/callback` | Secret check; call `handleTurn`; return ManyChat JSON |
| Session helper | `getOrCreateSessionByChannelUser("messenger", userId)` |
| Profile extract/validate | Shared by web + ManyChat |

### 4.3 Data flow

1. **Turn 1:** Default Reply POST `{ id/user_id, last_input_text }` → `handleTurn` → text + callback.
2. **Turn 2+:** ManyChat POST callback with same `user_id` + new text → same session → text + re-attach callback.
3. **Callback expiry (~24h):** next text hits Default Reply again; lookup by `user_id` still resumes the session.

### 4.4 Errors & edges

- Missing/wrong secret → `401`.
- Missing text / `user_id` → `200` + short “nhắn lại” (avoid 4xx on Default Reply).
- LLM timeout/throw → fixed Vietnamese fallback; no PII in logs.
- DB down → HTTP 503; ManyChat content-node fallback.
- Invalid phone/region → do not persist that field; re-ask.
- Image/sticker (no text) → one “nhắn chữ” line; skip empty `handleTurn`.
- Text > 2000 chars → trim or reject without crash.

### 4.5 Env

| Var | Role |
|-----|------|
| `MANYCHAT_CALLBACK_SECRET` | Header `x-manychat-secret` |
| `PUBLIC_BASE_URL` | `external_message_callback.url` |
| Existing `DATABASE_URL`, `OPENAI_*`, `ADMIN_SECRET` | Unchanged |

### 4.6 Testing

- Parse payload → `IncomingMessage`.
- Secret 401 vs 200.
- Dynamic Block includes callback URL + stripped text.
- Two turns, same `user_id` → one session.
- Profile extract + invalid phone/region (shared engine).
- Regression: `POST /api/chat` JSON unchanged.

### 4.7 ManyChat console (outside repo)

- Default Reply = Dynamic Block → `https://{PUBLIC_BASE_URL}/api/manychat/callback`.
- Header secret; fallback content if request fails.

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| LLM already falling back on web | Fix API key before Page demo |
| ManyChat plan lacks Dynamic Block | Confirm Pro + External Request |
| Timeout still too slow | 8–10s race; ManyChat fallback |
| Session split if user_id missing | Reject/re-ask; never create anonymous messenger sessions |
