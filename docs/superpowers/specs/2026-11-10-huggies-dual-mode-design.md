# Huggies dual-mode pitch demo — Design

**Status:** Design validated (brainstorming lock)  
**Date:** 2026-11-10  
**Approach:** Dual engine (Flow machine + AI guide agent), shared session/fields  
**Supersedes (partial):** UI config axes in `docs/huggies-demo-design.md` — replace `ai` on/off pitch control with `mode`; hide scenario for this pitch slice (happy path only). Core QC/job/access-code decisions from 2026-11-09 remain unless noted.

---

## 1. Understanding summary

- **What:** `/huggies` pitch demo with config **Channel × Mode**. Channel surfaces stay web mocks (Zalo = text/numbers; Messenger = buttons/gallery). Mode is **Flow chatbot** (step form + light LLM extract) or **AI guide** (hybrid conversational agent that follows the same field checklist and asks for whatever is still missing). Scenario errors are out of pitch focus; sessions run `success` only. Photo in Guide uses the hard UI (dropzone/camera) after text fields are complete, then the agent resumes.
- **Why:** Let pitch audiences compare channel UX and contrast rigid flow vs guided conversation while collecting the same baby/video data.
- **Who:** Pitch presenter and client in a room demo — not production traffic.
- **Constraints:** No live Zalo OA / Facebook Send API. Images never enter the LLM. Huggies stays an isolated module; Hyundai lead engine untouched. AI guide LLM timeout ≈ 5s. In-memory sessions.
- **Non-goals:** Live channel wiring; pitching `error_photo_invalid` / `error_render`; Hyundai-style free chat without checklist; putting image bytes/descriptions into the LLM; changing mode mid-session without restart.

---

## 2. Assumptions

| ID | Assumption |
|----|------------|
| A1 | Changing Channel or Mode on the config panel starts a **new** session. |
| A2 | Same field checklist for both modes: consent → baby name → display name → gender → age → hobby → photo → confirm → video job. |
| A3 | Default on `/huggies` load: **Mode = Flow**, channel = Zalo (unless product later asks otherwise). |
| A4 | Scenario remains in types/code (`success` \| `error_*`) but is **hidden** from the pitch panel; pitch always creates `success`. |
| A5 | Flow still may call OpenAI for light extract on natural sentences; UI stays step/form oriented. |
| A6 | Guide exit phrases (“không chơi nữa”, thôi, dừng…) → polite `end` (do not drag back to checklist). |
| A7 | AWS auth failure on photo keeps demo **soft-pass**; real QC failures still re-ask for another photo. |
| A8 | Guide keeps a short rolling transcript (≤ ~8 turns) for LLM context; Flow does not need full chat history. |
| A9 | Vietnamese-only assistant copy; English LLM crumbs are sanitized/dropped. |

---

## 3. Decision log

| # | Decision | Alternatives considered | Why |
|---|----------|-------------------------|-----|
| 1 | AI guide = **hybrid checklist agent** (option B) | Free Hyundai-like chat; extract-only upgrade | Matches “conversation + collect same data” without losing required fields |
| 2 | Channels = **web UI mock only** | Stub/docs for later wire; live ManyChat/FB now | Pitch scope; already decided earlier |
| 3 | Config axes = **Channel × Mode** (drop AI extract toggle) | Keep extract as third control; Flow with nested extract flag | Clearer pitch story: Flow vs Guide |
| 4 | Happy path only for this slice; **hide** scenario in UI | Remove scenario entirely; keep visible error radios | Focus pitch; keep code for later |
| 5 | Guide photo = **hard UI after text fields** | Fully agent-described photo; skip photo in Guide | Real Rekognition moment without stuffing images into LLM |
| 6 | Flow keeps **light extract** | Pure rigid / numbers-only | Natural short answers still work on Flow |
| 7 | Guide timeout **≈ 5s** | 8–10s; allow image-in-LLM | Snappier pitch; privacy unchanged |
| 8 | Default mode **Flow**; exit → **polite end** | Default Guide; drag user back to checklist | Safer open; respect stop intent |
| 9 | Architecture **Approach 1**: dual engine, shared session | Soft-prompt-only machine; fork Hyundai engine | Clear Mode contrast; YAGNI vs Hyundai fork |

---

## 4. Final design

### 4.1 Architecture

```
Config panel: Channel (zalo|messenger) + Mode (flow|guide)
        │
        ▼
POST /api/huggies/session  → Session { channel, mode, scenario: success, fields, job, … }
        │
POST /api/huggies/message
        ├─ mode=flow  → applyTurn (existing machine + light extract)
        └─ mode=guide → applyGuideTurn (new lib/huggies/agent)
                │
                ├─ text: LLM JSON → validate/merge → reply / exit / readyForPhoto / confirm
                └─ image: only when awaiting photo → Rekognition/QC → resume guide or confirmJob
        │
Shared: validate, copy surfaces by channel, store Map, job settle, video URLs
```

- **Flow:** existing `lib/huggies/machine.ts` (+ extract). Channel still drives numbered text vs chips.
- **Guide:** new `lib/huggies/agent.ts` (+ guide system prompt). Does not reuse Hyundai `handleTurn`.
- **UI:** `HuggiesChat` config shows Channel + Mode; hides Scenario and AI extract switch.

### 4.2 Session & routing

- Add `mode: "flow" | "guide"` on `Session`.
- Migrate pitch away from `ai` boolean in the UI. Implementation may map temporarily (`flow` ⇒ light extract on) then remove `ai` once tests/API updated.
- `POST /session` body: `{ channel, mode }` (scenario forced `success`).
- `POST /message`: branch on `session.mode`.
- Guide may store `guidePhase`: `collecting` | `awaiting_photo` | `confirm` | `processing` | `done` (or reuse `step` with looser transitions). Prefer reusing `step` where possible to share `confirmJob` / `settle`.

### 4.3 AI guide turn contract

LLM returns **one JSON object** (Vietnamese `reply` only):

```ts
{
  reply: string;           // user-facing VN
  fields?: Partial<Fields>; // babyName, displayName, gender, ageRange, hobby, consent…
  exit?: boolean;          // polite end
  readyForPhoto?: boolean; // text checklist complete → show hard photo UI
  confirm?: boolean;       // create video job
}
```

Server:

1. Race LLM with ~5s timeout.
2. Validate each field with existing parsers; ignore invalid values.
3. Merge into session; compute `missing[]`.
4. If `exit` → step `end`, polite copy.
5. Else if text-complete → set awaiting photo, return reply + UI flag for dropzone/camera.
6. Else reply should ask for **one** (max two) missing items — server may append a missing-field hint if model omits it.
7. On image while awaiting photo → same QC path as Flow; on success → confirm prompt; on `confirm` → `confirmJob`.
8. Image before text-complete → soft refuse + ask missing field.

Short history (≤8 messages) passed into the LLM with current fields + missing list.

### 4.4 Channel surfaces

| | Flow | Guide |
|---|------|--------|
| Zalo | Numbered options in bubble; no chips | Mostly free text; optional numbered hints in agent reply; camera for photo |
| Messenger | Chips / confirm card / media / dropzone | Free text + optional chips for consent/confirm; dropzone when awaiting photo; result media card |

### 4.5 Errors & edge cases

- Timeout / bad JSON → VN soft line + ask one missing field.
- Affirmatives (“oke nha”, “đồng ý”) on display name / confirm — same intent rules as improved Flow parsers.
- Multi-field utterances in Guide merge in one turn.
- Session lost → recreate (existing 404 recovery).
- Soft-pass photo on AWS auth failure (demo).

### 4.6 Testing

- Vitest for agent: merge fields, exit, timeout fallback, reject early photo, readyForPhoto → confirmJob.
- Flow regression suite stays green.
- API tests: session accepts `mode`; message routes to guide vs flow.
- LLM/Rekognition mocked; no mandatory browser E2E in first slice.

### 4.7 Implementation sketch (handoff only — not started)

1. Types + session/API `mode`; hide scenario / AI extract in UI; default Flow.  
2. `lib/huggies/agent.ts` + prompts + tests.  
3. Wire `message` route + Guide photo UI flag in `HuggiesChat`.  
4. Affirmative/exit coverage; graphify update; manual pitch checklist.

---

## 5. Explicit non-goals (this slice)

- Live Zalo OA / Messenger Send API / ManyChat for Huggies  
- Pitching error scenarios  
- Image-to-LLM  
- Editing Hyundai conversation engine  
- Persisting Huggies sessions to MySQL  

---

**Next:** User reviews this spec file. On approval → writing-plans / implementation.
