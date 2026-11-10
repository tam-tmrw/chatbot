import { foldVn } from "@/lib/conversation/flow";
import { sanitizeReply } from "@/lib/huggies/ai";
import {
  confirmSummary,
  consentPrompt,
  firstMissingHint,
  looksLikeTermsAsk,
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
import { HOBBIES, isAffirmative, parseBabyName, parseDisplayName } from "@/lib/huggies/validate";

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

/** Consent needs affirmative user text (never LLM-only); negation blocks it. */
function userConsents(text: string): boolean {
  const t = foldVn(text);
  if (/\b(khong|chua|ko|k)\s+dong y\b/.test(t)) return false;
  return isAffirmative(text) || /\bdong y\b/.test(t);
}

function mergeGuideFields(session: Session, raw: GuideLlmResult["fields"], userText: string): void {
  if (!raw && !userText) return;
  const f = session.fields;
  if (!f.consent && userConsents(userText)) {
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

  if (session.step === "confirm" && session.fields.photoOk && isAffirmative(userText)) {
    return startVideoJob(session, deps);
  }

  if (!session.fields.consent && looksLikeTermsAsk(userText) && !userConsents(userText)) {
    const msg = consentPrompt(deps.termsUrl);
    session.step = "consent";
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  let parsed: GuideLlmResult;
  try {
    parsed = await callGuideLlm(session, userText, deps);
  } catch {
    const msg = `Mình chưa nghe rõ ạ.\n${firstMissingHint(session.fields, { termsUrl: deps.termsUrl })}`;
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  if (parsed.exit === true) {
    session.step = "end";
    const msg = sanitizeReply(parsed.reply) ?? END_MSG;
    pushHistory(session, "assistant", msg);
    return viewGuide(session, [msg]);
  }

  mergeGuideFields(session, parsed.fields, userText);

  if (parsed.confirm && session.fields.photoOk && textFieldsComplete(session.fields)) {
    return startVideoJob(session, deps);
  }

  if (textFieldsComplete(session.fields) && !session.fields.photoOk) {
    session.step = "photo";
    const reply =
      sanitizeReply(parsed.reply) ??
      "Thông tin đủ rồi ạ. Ba mẹ gửi 1 ảnh mặt bé rõ, nhìn thẳng, đủ sáng nhé.";
    pushHistory(session, "assistant", reply);
    return viewGuide(session, [reply]);
  }

  const reply =
    sanitizeReply(parsed.reply) ?? firstMissingHint(session.fields, { termsUrl: deps.termsUrl });
  const hint = firstMissingHint(session.fields, { termsUrl: deps.termsUrl });
  const withHint =
    textFieldsComplete(session.fields)
      ? reply
      : reply.includes("?")
        ? reply
        : `${reply}\n${hint}`;
  if (!session.fields.consent) session.step = "consent";
  else if (!session.fields.babyName) session.step = "baby_name";
  else if (!session.fields.displayName) session.step = "display_name";
  else if (!session.fields.gender) session.step = "gender";
  else if (!session.fields.ageRange) session.step = "age_range";
  else if (!session.fields.hobby) session.step = "hobby";
  pushHistory(session, "assistant", withHint);
  return viewGuide(session, [withHint]);
}
