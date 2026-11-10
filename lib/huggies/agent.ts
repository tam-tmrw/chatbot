import { foldVn } from "@/lib/conversation/flow";
import { sanitizeReply } from "@/lib/huggies/ai";
import {
  confirmSummary,
  consentPrompt,
  firstMissingHint,
  guideReprompt,
  looksLikeConfused,
  looksLikeTermsAsk,
  PHOTO_ASK,
  textFieldsComplete,
} from "@/lib/huggies/checklist";
import { qcUserCopy } from "@/lib/huggies/copy";
import { applyTurn, startVideoJob, type MachineDeps } from "@/lib/huggies/machine";
import type {
  AgeRange,
  Gender,
  HobbyId,
  Session,
  TurnInput,
  TurnResult,
} from "@/lib/huggies/types";
import {
  HOBBIES,
  isAffirmative,
  parseAgeToken,
  parseBabyName,
  parseDisplayName,
  parseGenderToken,
  parseHobbyToken,
} from "@/lib/huggies/validate";

export type GuideLlmResult = {
  reply?: string | null;
  fields?: {
    consent?: boolean;
    babyName?: string | null;
    displayName?: string | null;
    gender?: Gender | null;
    ageRange?: AgeRange | null;
    hobby?: HobbyId | null;
  };
  exit?: boolean;
  readyForPhoto?: boolean;
  confirm?: boolean;
};

export type GuideDeps = MachineDeps & {
  guideChat: (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => Promise<string>;
  guideTimeoutMs?: number;
};

const HISTORY_MAX = 8;
const END_MSG = "Cảm ơn ba mẹ đã ghé. Khi nào muốn tạo video cho bé, nhắn mình lại nhé.";
const POST_STEPS = ["result", "error", "cs"];

function pushHistory(session: Session, role: "user" | "assistant", content: string) {
  session.guideHistory = [...session.guideHistory, { role, content }].slice(-HISTORY_MAX);
}

function looksLikeExit(text: string): boolean {
  const t = foldVn(text);
  return /\b(khong choi|thoi di|thoi nha|dung lai|ket thuc|stop|bye|exit)\b/.test(t);
}

const NEGATES_CONSENT = /\b(khong|chua|ko|k)\s+dong y\b/;

/**
 * Consent needs user text (never LLM-only); negation blocks it. Bare "ok"/"vâng" only counts once
 * the consent prompt was shown (step "consent"); before that, explicit "đồng ý" is required.
 */
function userConsents(text: string, step: Session["step"]): boolean {
  const t = foldVn(text);
  if (NEGATES_CONSENT.test(t)) return false;
  return /\bdong y\b/.test(t) || (step === "consent" && isAffirmative(text));
}

function syncGuideStep(session: Session): void {
  const f = session.fields;
  if (!f.consent) session.step = "consent";
  else if (!f.babyName) session.step = "baby_name";
  else if (!f.displayName) session.step = "display_name";
  else if (!f.gender) session.step = "gender";
  else if (!f.ageRange) session.step = "age_range";
  else if (!f.hobby) session.step = "hobby";
  else if (!f.photoOk) session.step = "photo";
  else session.step = "confirm";
}

/** Deterministic field fill from user text — Guide must work when LLM times out. */
function applyGuideHeuristics(session: Session, userText: string): boolean {
  const f = session.fields;
  const t = foldVn(userText);
  let changed = false;

  if (!f.babyName) {
    // Leave multi-field / option tokens for the LLM; only accept clear name answers.
    if (
      userText.includes(",") ||
      userText.length > 24 ||
      /^(trai|gai|boy|girl|nam|nu|[1-4])$/i.test(userText.trim()) ||
      /\b(dong y|thich|tuoi|xe hoi|am nhac)\b/.test(t)
    ) {
      /* skip */
    } else {
      const stripped = userText
        .replace(/^\s*(bé\s+tên|be\s+ten|tên\s+bé|ten\s+be|tên\s+là|ten\s+la|tên|ten)\s*[:\-]?\s*/i, "")
        .trim();
      const n = parseBabyName(stripped) ?? parseBabyName(userText);
      if (n) {
        f.babyName = n;
        changed = true;
      }
    }
  } else if (!f.displayName) {
    const keepName =
      isAffirmative(userText) ||
      /\b(giu ten|giu nguyen|dung ten|xai ten|ten nay|de nguyen|giu luon)\b/.test(t);
    if (keepName) {
      const n = parseDisplayName(f.babyName.replace(/\s+/g, "").slice(0, 12));
      if (n) {
        f.displayName = n;
        changed = true;
      }
    } else {
      const squeezed = userText.replace(/\s+/g, "").slice(0, 12);
      const n = parseDisplayName(squeezed) ?? parseDisplayName(userText.trim());
      if (n) {
        f.displayName = n;
        changed = true;
      }
    }
  } else if (!f.gender) {
    const fromToken = parseGenderToken(userText);
    if (fromToken) {
      f.gender = fromToken;
      changed = true;
    } else if (/\b(be\s+trai|trai|boy|nam)\b/.test(t)) {
      f.gender = "boy";
      changed = true;
    } else if (/\b(be\s+gai|gai|girl|nu)\b/.test(t)) {
      f.gender = "girl";
      changed = true;
    } else if (/\b(khong neu|khong noi|khong noi gi|unspecified)\b/.test(t)) {
      f.gender = "unspecified";
      changed = true;
    }
  } else if (!f.ageRange) {
    const fromToken = parseAgeToken(userText);
    if (fromToken) {
      f.ageRange = fromToken;
      changed = true;
    } else if (/\b(duoi\s*1|so sinh|newborn)\b/.test(t) || t.includes("<1")) {
      f.ageRange = "<1";
      changed = true;
    } else if (/\b(1\s*[-~]\s*2|1\s*den\s*2|1\s*toi\s*2)\b/.test(t)) {
      f.ageRange = "1-2";
      changed = true;
    } else if (/\b(2\s*[-~]\s*3|2\s*den\s*3|2\s*toi\s*3)\b/.test(t)) {
      f.ageRange = "2-3";
      changed = true;
    } else if (/\b(tren\s*3|hon\s*3)\b/.test(t) || t.includes(">3")) {
      f.ageRange = ">3";
      changed = true;
    }
  } else if (!f.hobby) {
    const fromToken = parseHobbyToken(userText);
    if (fromToken) {
      f.hobby = fromToken;
      changed = true;
    } else {
      const hit = HOBBIES.find((h) => t.includes(foldVn(h.label)) || t.includes(h.id));
      if (hit) {
        f.hobby = hit.id;
        changed = true;
      }
    }
  }

  if (changed) syncGuideStep(session);
  return changed;
}

function mergeGuideFields(
  session: Session,
  raw: GuideLlmResult["fields"],
  userText: string,
  stepBefore: Session["step"],
): void {
  if (!raw && !userText) return;
  const f = session.fields;
  if (!f.consent && userConsents(userText, stepBefore)) {
    f.consent = true;
    f.consentAt = f.consentAt ?? new Date().toISOString();
  }
  if (typeof raw?.babyName === "string") {
    const n = parseBabyName(raw.babyName);
    if (n) f.babyName = n;
  }
  if (typeof raw?.displayName === "string") {
    const n = parseDisplayName(raw.displayName);
    if (n) f.displayName = n;
  } else if (f.babyName && isAffirmative(userText) && !f.displayName) {
    const n = parseDisplayName(f.babyName.replace(/\s+/g, "").slice(0, 12));
    if (n) f.displayName = n;
  }
  if (raw?.gender === "boy" || raw?.gender === "girl" || raw?.gender === "unspecified") {
    f.gender = raw.gender;
  }
  if (
    raw?.ageRange === "<1" ||
    raw?.ageRange === "1-2" ||
    raw?.ageRange === "2-3" ||
    raw?.ageRange === ">3"
  ) {
    f.ageRange = raw.ageRange;
  }
  if (typeof raw?.hobby === "string" && HOBBIES.some((h) => h.id === raw.hobby)) {
    f.hobby = raw.hobby as HobbyId;
  }
  // Always try user text too — LLM may return empty fields.
  applyGuideHeuristics(session, userText);
  syncGuideStep(session);
}

function advanceAfterHeuristics(session: Session, deps: GuideDeps): TurnResult {
  syncGuideStep(session);
  if (textFieldsComplete(session.fields) && !session.fields.photoOk) {
    session.step = "photo";
    const msg = PHOTO_ASK;
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }
  const msg = firstMissingHint(session.fields, { termsUrl: deps.termsUrl });
  pushHistory(session, "assistant", msg);
  return viewGuide(session, [msg]);
}

function systemPrompt(session: Session, termsUrl: string): string {
  return `Bạn là trợ lý Huggies (tiếng Việt, thân thiện). Thu thập: consent, babyName, displayName (≤12, không space), gender, ageRange, hobby rồi ảnh (UI riêng), rồi confirm tạo video.
Trả ĐÚNG một JSON: { "reply": string, "fields": {...}|{}, "exit": boolean, "readyForPhoto": boolean, "confirm": boolean }.
CẤM tiếng Anh trong reply. Không bịa field. Nếu user muốn dừng → exit=true.
Khi đủ field text → readyForPhoto=true. Khi đã có ảnh và user đồng ý tạo → confirm=true.
Fields hiện tại: ${JSON.stringify(session.fields)}
Missing hint: ${firstMissingHint(session.fields, { termsUrl })}`;
}

async function callGuideLlm(session: Session, userText: string, deps: GuideDeps): Promise<GuideLlmResult> {
  const timeoutMs = deps.guideTimeoutMs ?? Number(process.env.HUGGIES_GUIDE_TIMEOUT_MS ?? 5000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM timeout")), timeoutMs);
  });
  try {
    const messages = [
      { role: "system" as const, content: systemPrompt(session, deps.termsUrl) },
      ...session.guideHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: userText },
    ];
    const raw = await Promise.race([deps.guideChat(messages), timeout]);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("invalid json");
    return JSON.parse(raw.slice(start, end + 1)) as GuideLlmResult;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function viewGuide(session: Session, messages: string[], buttons: TurnResult["buttons"] = []): TurnResult {
  return {
    session,
    messages,
    buttons,
    jobId: session.job?.id ?? null,
    restart: false,
  };
}

export async function applyGuideTurn(
  inputSession: Session,
  input: TurnInput,
  deps: GuideDeps,
): Promise<TurnResult> {
  const session = structuredClone(inputSession);

  if (session.step === "end") return viewGuide(session, [END_MSG]);
  // Post-result states reuse the flow machine (share/replay/learn/retry).
  if (POST_STEPS.includes(session.step)) return applyTurn(session, input, deps);

  if (session.step === "processing") {
    return viewGuide(session, ["Video đang xử lý. Ba mẹ chờ mình một chút nhé!"]);
  }

  if (input.type === "image") {
    if (!textFieldsComplete(session.fields) || session.step !== "photo") {
      const msg = `Mình cần vài thông tin trước khi nhận ảnh ạ.\n${firstMissingHint(session.fields, { termsUrl: deps.termsUrl })}`;
      pushHistory(session, "assistant", msg);
      return viewGuide(session, [msg]);
    }
    if (!input.qc || "awsError" in input.qc) {
      return viewGuide(session, [
        "Mình chưa kiểm tra được ảnh (lỗi dịch vụ nhận diện). Ba mẹ gửi lại JPG/PNG giúp mình nhé.",
      ]);
    }
    if (!input.qc.ok) {
      session.photoFails += 1;
      const msg = `Ảnh chưa đạt (${qcUserCopy(input.qc.reason)}). Ba mẹ gửi ảnh khác giúp mình nhé.`;
      return viewGuide(session, [msg]);
    }
    session.fields.photoOk = true;
    session.step = "confirm";
    const msg = confirmSummary(session.fields);
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  const userText = (input.text ?? "").trim() || (input.buttonId ?? "");
  if (!userText) {
    return viewGuide(session, [firstMissingHint(session.fields, { termsUrl: deps.termsUrl })]);
  }
  pushHistory(session, "user", userText);

  if (looksLikeExit(userText)) {
    session.step = "end";
    pushHistory(session, "assistant", END_MSG);
    return viewGuide(session, [END_MSG]);
  }

  if (
    session.step === "confirm" &&
    session.fields.photoOk &&
    (isAffirmative(userText) || /\bxac nhan\b/.test(foldVn(userText)))
  ) {
    return startVideoJob(session, deps);
  }

  const stepBefore = session.step;

  // Consent is a hard gate — never depend on the LLM (timeout was blocking "đồng ý"/"ok").
  if (!session.fields.consent) {
    if (NEGATES_CONSENT.test(foldVn(userText))) {
      session.step = "end";
      pushHistory(session, "assistant", END_MSG);
      return viewGuide(session, [END_MSG]);
    }
    if (userConsents(userText, stepBefore)) {
      session.fields.consent = true;
      session.fields.consentAt = session.fields.consentAt ?? new Date(deps.now()).toISOString();
      session.step = "baby_name";
      // Pure "ok"/"đồng ý" → ask next field. Richer first message still goes to LLM below.
      const remainder = foldVn(userText)
        .replace(/\bdong y\b/g, " ")
        .replace(/\b(ok|oke|okay|vang|duoc)\b/g, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
      if (isAffirmative(userText) || remainder.length < 3) {
        const msg = firstMissingHint(session.fields, { termsUrl: deps.termsUrl });
        pushHistory(session, "assistant", msg);
        return viewGuide(session, [msg]);
      }
    } else {
      session.step = "consent";
      const msg =
        looksLikeConfused(userText) || looksLikeTermsAsk(userText)
          ? guideReprompt(session.fields, deps.termsUrl)
          : consentPrompt(deps.termsUrl);
      pushHistory(session, "assistant", msg);
      return viewGuide(session, [msg]);
    }
  }

  // Clarification / off-script → re-explain current need (no LLM).
  if (looksLikeConfused(userText)) {
    const msg = guideReprompt(session.fields, deps.termsUrl);
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  // Prefer parsers over LLM for simple one-field answers (LLM timeout was stranding baby_name+).
  if (applyGuideHeuristics(session, userText)) {
    return advanceAfterHeuristics(session, deps);
  }

  let parsed: GuideLlmResult;
  try {
    parsed = await callGuideLlm(session, userText, deps);
  } catch {
    if (applyGuideHeuristics(session, userText)) {
      return advanceAfterHeuristics(session, deps);
    }
    const msg = guideReprompt(session.fields, deps.termsUrl);
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  if (parsed.exit === true) {
    session.step = "end";
    const msg = sanitizeReply(parsed.reply) ?? END_MSG;
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  mergeGuideFields(session, parsed.fields, userText, stepBefore);

  if (parsed.confirm && session.fields.photoOk && textFieldsComplete(session.fields)) {
    return startVideoJob(session, deps);
  }

  if (textFieldsComplete(session.fields) && !session.fields.photoOk) {
    session.step = "photo";
    const reply = sanitizeReply(parsed.reply) ?? PHOTO_ASK;
    pushHistory(session, "assistant", reply);
    return viewGuide(session, [reply]);
  }

  const hint = firstMissingHint(session.fields, { termsUrl: deps.termsUrl });
  const reply = sanitizeReply(parsed.reply) ?? hint;
  const withHint =
    textFieldsComplete(session.fields) || reply.includes("?")
      ? reply
      : `${reply}\n${hint}`;
  syncGuideStep(session);
  pushHistory(session, "assistant", withHint);
  return viewGuide(session, [withHint]);
}
