# Multi-bubble replies + competitor brand compare — Design

**Status:** Design validated (brainstorming lock)  
**Date:** 2026-08-24  
**Approach:** LLM emits JSON `bubbles[]` (option B); server validates/clamps; web staggers; ManyChat multi `messages[]`. Auto soft-compare other brands vs Hyundai/Palisade.

---

## 1. Understanding summary

- **What:** (1) Split LLM replies into up to **3** moderate bubbles so Minh feels continuously responsive without info dumps. (2) When the user mentions a non-Hyundai brand, the bot **auto-compares** with Hyundai lines (e.g. Palisade) using soft fit + disclaimer when exact competitor specs are unknown.
- **Why:** Better chat UX (not one dense wall of text); comparison room without sounding like a Hyundai sales bot or inventing competitor numbers.
- **Who:** Web chat users + Messenger via ManyChat (internal demo).
- **Constraints:** Palisade-only KB; LLM timeout 10s before parse; re-ask / fallback / ManyChat nudges stay **1 bubble**; stagger delay configurable (default ~800ms); same split rule on web + ManyChat.
- **Non-goals:** Token streaming; job queue; full competitor KB; splitting system messages (phone/region re-ask, timeout fallback, empty-text nudges).

---

## 2. Assumptions

| ID | Assumption |
|----|------------|
| B1 | Demo scale: internal, 1 Page, low traffic. |
| B2 | ManyChat delivers multiple bubbles as multiple `content.messages[]` in **one** Dynamic Block response (no per-bubble HTTP callbacks). |
| B3 | Web client staggers bubble render with `BUBBLE_STAGGER_MS` (default 800). |
| B4 | DB stores **one** joined assistant message per turn (`texts.join("\n\n")`) so history/LLM context stay simple. |
| B5 | Hyundai/Palisade facts only from KNOWLEDGE; other brands = soft/fit comparison + explicit uncertainty on exact numbers. |
| B6 | If LLM returns non-JSON, treat as a single bubble (graceful degradation). |
| B7 | While web is still staggering bubbles, input stays disabled until the last bubble is shown. |
| B8 | Security/privacy model unchanged (`MANYCHAT_CALLBACK_SECRET`, no new PII surfaces). |

---

## 3. Decision log

| # | Decision | Alternatives considered | Why |
|---|----------|-------------------------|-----|
| 1 | Delivery = hybrid multi-bubble (LLM may write long; system delivers segments) | Prompt-only shorter single message; client-only web split | Real “always replying” feel on both channels |
| 2 | Architecture = **LLM JSON `bubbles[]`** (option B) | Server heuristic split; client-only split | Better semantic segments; shared contract for web + ManyChat |
| 3 | Auto-compare when other brand mentioned | Compare only if Hyundai already in history / user asks; never auto | Product wants room to compare vs Hyundai lines |
| 4 | Soft compare + disclaimer if missing exact competitor data | Invent specs from model knowledge; soft-only silent | Honesty + avoid hallucinated prices |
| 5 | Web **and** ManyChat same split rule | Web-only or ManyChat-only first | Consistent Minh UX |
| 6 | Max **3** bubbles; delay **config**, default ~800ms | Fixed 2 bubbles / fixed 400–600ms | Tunable later like `REPLY_DELAY_MS` |
| 7 | Only normal LLM replies are multi-bubble | Split everything including re-asks | Keep validation/error UX crisp |
| 8 | NFR defaults for internal demo | Production-grade streaming/queue | YAGNI |

---

## 4. Final design

### 4.1 Architecture

```
User text → handleTurn → LLM (JSON bubbles) → parseBubbles → texts[1..3]
  → DB: one assistant message (joined)
  → Web API: { reply, replies, leadCaptured, sessionId }
  → ManyChat: toDynamicBlock(texts) → messages[]
```

LLM is instructed to return **JSON only**:

```json
{ "bubbles": ["đoạn 1", "đoạn 2"] }
```

- Length: 1–3 strings; each segment moderate (~2–4 sentences).
- Server: `parseBubbles(raw)` — parse, trim, drop empties, **clamp ≤ 3**.
- Parse failure / wrong shape → single bubble = raw trimmed text.
- Re-ask phone/region, LLM timeout fallback, ManyChat nudges → **bypass** JSON; one string.

### 4.2 Components

| Piece | Change |
|-------|--------|
| `prompts/system.md`, `fewshots.md` | JSON bubble contract; auto soft-compare other brands vs Hyundai/Palisade + disclaimer |
| `lib/conversation/bubbles.ts` | `parseBubbles`, `MAX_BUBBLES = 3` |
| `lib/conversation/engine.ts` | Parse after successful LLM; set `texts` + `text` |
| `lib/channels/types.ts` | `OutgoingMessage.texts: string[]`; keep `text` |
| `app/api/chat/route.ts` | Expose `replies` (+ `reply` joined for compatibility) |
| `app/components/Chat.tsx` | Stagger `replies` with `BUBBLE_STAGGER_MS`; disable input until done |
| `lib/channels/manychat.ts` | `toDynamicBlock` accepts `string \| string[]` |
| Tests | `bubbles.test.ts`; update api-chat / api-manychat / engine mocks |

### 4.3 Competitor compare (prompt behavior)

When user mentions a non-Hyundai brand/model:

1. Auto-compare with Hyundai/Palisade on fit, segment, lifestyle needs — not a hard sell.
2. Use Palisade facts only from KNOWLEDGE.
3. If competitor exact price/specs unknown → say so clearly; compare by feel/segment.
4. Do not invent competitor numbers. Do not force “must choose Hyundai.”

### 4.4 Errors & edges

| Case | Handling |
|------|----------|
| Non-JSON / markdown dump | 1 bubble |
| `bubbles` empty or >3 | Drop empty; slice to 3 |
| Timeout / LLM throw | Existing FALLBACK, 1 bubble |
| New user message during web stagger | Input disabled until stagger completes |
| ManyChat | No server-side inter-message delay; platform shows messages in order |

### 4.5 Testing

- Unit: JSON 1/2/3 bubbles, clamp 4→3, plain-text fallback, junk JSON.
- Engine mock: JSON → `texts.length`; phone re-ask skips parser.
- API chat: `replies` present.
- ManyChat: two strings → two Dynamic Block text messages.
- Manual: web stagger; “so với Fortuner…” soft compare + disclaimer.

### 4.6 Config knobs

- `MAX_BUBBLES = 3` (server)
- `BUBBLE_STAGGER_MS = 800` (web client; tunable later / env if needed)

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| Model ignores JSON format | Fallback to 1 bubble |
| Extra latency / tokens for structured output | Accept for UX; keep timeout 10s |
| ManyChat no visual stagger | Accept; still multiple bubbles |
| Soft compare still feels salesy | Prompt + fewshots; no “must choose Hyundai” |

---

## 6. Out of scope

- Streaming tokens
- Per-bubble DB rows
- Competitor product KB / scrapers
- Splitting validation re-asks or system nudges
