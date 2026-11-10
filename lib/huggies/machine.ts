import { foldVn } from "@/lib/conversation/flow";
import { ackFor, gentleHint, promptFor, qcUserCopy } from "@/lib/huggies/copy";
import { parseGenderInput } from "@/lib/huggies/gender";
import type {
  AgeRange,
  DemoChannel,
  DemoMode,
  Extracted,
  Gender,
  HobbyId,
  QcReason,
  Scenario,
  Session,
  StepId,
  TurnInput,
  TurnResult,
} from "@/lib/huggies/types";
import {
  HOBBIES,
  isAffirmative,
  parseAgeToken,
  parseBabyName,
  parseDisplayName,
  parseHobbyToken,
} from "@/lib/huggies/validate";

export const FAKE_REASONS: QcReason[] = [
  "no_face",
  "blurry",
  "too_dark",
  "covered",
  "low_res",
  "multi_face",
];

export type MachineDeps = {
  now: () => number;
  delayMs: number;
  newJobId: () => string;
  /** Fallback pool (unspecified gender, or when boy/girl pools empty). */
  videoUrls: string[];
  videoUrlsBoy?: string[];
  videoUrlsGirl?: string[];
  pickVideo: (urls: string[]) => string;
  previewUrl: string | null;
  learnMoreUrl: string;
  termsUrl: string;
  extract?: (step: StepId, text: string, session: Session) => Promise<Extracted>;
};

/** Pick the demo video pool from gender; never cross into the other gender's list. */
export function videoPoolForGender(
  gender: Session["fields"]["gender"],
  deps: Pick<MachineDeps, "videoUrls" | "videoUrlsBoy" | "videoUrlsGirl">,
): string[] {
  if (gender === "boy") {
    if ((deps.videoUrlsBoy?.length ?? 0) > 0) return deps.videoUrlsBoy!;
    return deps.videoUrls;
  }
  if (gender === "girl") {
    if ((deps.videoUrlsGirl?.length ?? 0) > 0) return deps.videoUrlsGirl!;
    return deps.videoUrls;
  }
  // unspecified / null — shared fallback, else merge both
  if (deps.videoUrls.length > 0) return deps.videoUrls;
  return [...(deps.videoUrlsBoy ?? []), ...(deps.videoUrlsGirl ?? [])];
}

const COLLECT: StepId[] = [
  "baby_name",
  "display_name",
  "gender",
  "age_range",
  "hobby",
  "confirm",
];

export function freshSession(input: {
  id: string;
  scenario?: Scenario;
  channel?: DemoChannel;
  mode?: DemoMode;
  termsVersion: string;
}): Session {
  const mode = input.mode ?? "flow";
  return {
    id: input.id,
    scenario: input.scenario ?? "success",
    channel: input.channel ?? "zalo",
    mode,
    ai: mode === "flow",
    guideHistory: [],
    step: "welcome",
    fields: {
      consent: false,
      consentAt: null,
      termsVersion: input.termsVersion,
      babyName: null,
      displayName: null,
      gender: null,
      ageRange: null,
      hobby: null,
      photoOk: false,
    },
    photoFails: 0,
    fakeReasonIndex: 0,
    editMenu: false,
    returnTo: null,
    job: null,
  };
}

function nextIncomplete(session: Session): StepId {
  const f = session.fields;
  if (!f.consent) return "consent";
  if (!f.babyName) return "baby_name";
  if (!f.displayName) return "display_name";
  if (!f.gender) return "gender";
  if (!f.ageRange) return "age_range";
  if (!f.hobby) return "hobby";
  if (!f.photoOk) return "photo";
  return "confirm";
}

function view(session: Session, extra: Partial<TurnResult> = {}): TurnResult {
  const prompt = promptFor(session);
  return {
    session,
    messages: extra.messages ?? [prompt.text],
    buttons: extra.buttons ?? prompt.buttons,
    jobId: session.job?.id ?? null,
    restart: extra.restart ?? false,
  };
}

function advanceView(session: Session, fromStep: StepId): TurnResult {
  const prompt = promptFor(session);
  const ack = ackFor(fromStep, session);
  return view(session, {
    messages: ack ? [`${ack}\n\n${prompt.text}`] : [prompt.text],
    buttons: prompt.buttons,
  });
}

function norm(text?: string): string {
  return foldVn(text ?? "").trim();
}

function go(session: Session, linear: StepId) {
  if (session.returnTo) {
    session.step = session.returnTo;
    session.returnTo = null;
    session.editMenu = false;
    return;
  }
  session.step = linear;
}

const STEP_FIELD: Partial<Record<StepId, keyof Session["fields"]>> = {
  baby_name: "babyName",
  display_name: "displayName",
  gender: "gender",
  age_range: "ageRange",
  hobby: "hobby",
};

function mayOverwriteField(
  session: Session,
  field: "babyName" | "displayName" | "gender" | "ageRange" | "hobby",
): boolean {
  if (STEP_FIELD[session.step] === field) return true;
  const current = session.fields[field];
  return current == null;
}

function applyExtracted(session: Session, extracted: Extracted): boolean {
  let applied = false;
  if (extracted.babyName && mayOverwriteField(session, "babyName")) {
    const name = parseBabyName(extracted.babyName);
    if (name) {
      session.fields.babyName = name;
      applied = true;
    }
  }
  if (extracted.displayName && mayOverwriteField(session, "displayName")) {
    const name = parseDisplayName(extracted.displayName);
    if (name) {
      session.fields.displayName = name;
      applied = true;
    }
  }
  if (
    (extracted.gender === "boy" || extracted.gender === "girl") &&
    mayOverwriteField(session, "gender")
  ) {
    session.fields.gender = extracted.gender;
    applied = true;
  }
  if (
    (extracted.ageRange === "<1" ||
      extracted.ageRange === "1-2" ||
      extracted.ageRange === "2-3" ||
      extracted.ageRange === ">3") &&
    mayOverwriteField(session, "ageRange")
  ) {
    session.fields.ageRange = extracted.ageRange;
    applied = true;
  }
  if (
    extracted.hobby &&
    HOBBIES.some((h) => h.id === extracted.hobby) &&
    mayOverwriteField(session, "hobby")
  ) {
    session.fields.hobby = extracted.hobby;
    applied = true;
  }
  return applied;
}

export function startVideoJob(session: Session, deps: MachineDeps): TurnResult {
  const missing = nextIncomplete(session);
  if (missing !== "confirm") {
    session.step = missing;
    session.editMenu = false;
    return view(session);
  }
  if (!session.job) {
    session.job = {
      id: deps.newJobId(),
      status: "processing",
      templateId: `tpl_${session.fields.hobby}_v1`,
      videoUrl: null,
      previewUrl: null,
      errorCode: null,
      retries: 0,
      readyAt: deps.now() + deps.delayMs,
      announced: false,
      genderSnap: session.fields.gender,
    };
  } else {
    session.job.genderSnap = session.fields.gender;
  }
  session.step = "processing";
  session.editMenu = false;
  return view(session);
}

function confirmJob(session: Session, deps: MachineDeps): TurnResult {
  return startVideoJob(session, deps);
}

function failPhoto(session: Session, reason: QcReason): TurnResult {
  session.photoFails += 1;
  if (session.photoFails >= 3) {
    session.step = "cs";
    return view(session, {
      messages: [
        "Mình đã nhận 3 ảnh chưa đạt. Ba mẹ nhắn tư vấn viên để được hỗ trợ thêm nhé.",
      ],
    });
  }
  return view(session, {
    messages: [
      `Ảnh chưa đạt (${qcUserCopy(reason)}). Ba mẹ gửi lại ảnh khác giúp mình nhé.`,
    ],
  });
}

function genderOf(input: TurnInput): Gender | null {
  return parseGenderInput(input.buttonId) ?? parseGenderInput(input.text);
}

function ageOf(input: TurnInput): AgeRange | null {
  if (input.buttonId?.startsWith("age_")) return parseAgeToken(input.buttonId.slice(4));
  return parseAgeToken(input.text ?? "");
}

function hobbyOf(input: TurnInput): HobbyId | null {
  if (input.buttonId && HOBBIES.some((h) => h.id === input.buttonId)) {
    return input.buttonId as HobbyId;
  }
  return parseHobbyToken(input.text ?? "");
}

function applyRigid(session: Session, input: TurnInput, deps: MachineDeps): TurnResult {
  if (session.step === "processing") {
    return view(session, {
      messages: ["Video đang xử lý. Ba mẹ chờ mình một chút nhé."],
      buttons: [],
    });
  }
  if (input.type === "image" && session.step !== "photo") return view(session);

  const t = norm(input.text);
  switch (session.step) {
    case "welcome": {
      const start =
        input.buttonId === "start" || t === "1" || t === "bat dau" || t === "choi";
      if (!start) {
        return view(session, {
          messages: [
            session.channel === "messenger"
              ? "Ba mẹ bấm Bắt đầu hoặc gõ 1 giúp mình nhé."
              : "Ba mẹ gõ 1 để bắt đầu giúp mình nhé.",
          ],
        });
      }
      session.step = "consent";
      return view(session);
    }
    case "consent": {
      const choice =
        input.buttonId === "yes" || input.buttonId === "terms" || input.buttonId === "no"
          ? input.buttonId
          : t === "1" || t === "dong y"
            ? "yes"
            : t === "2" || t === "xem dieu khoan" || t === "xem"
              ? "terms"
              : t === "3" || t === "khong" || t === "khong dong y"
                ? "no"
                : null;
      if (choice === "yes") {
        session.fields.consent = true;
        session.fields.consentAt = new Date(deps.now()).toISOString();
        session.step = "baby_name";
        return view(session);
      }
      if (choice === "terms") {
        return view(session, {
          messages: [`Điều khoản: ${deps.termsUrl}`, promptFor(session).text],
        });
      }
      if (choice === "no") {
        session.step = "end";
        return view(session);
      }
      return view(session);
    }
    case "baby_name": {
      const name = parseBabyName(input.text ?? "");
      if (!name) {
        return view(session, { messages: [gentleHint("baby_name")] });
      }
      const from = session.step;
      session.fields.babyName = name;
      go(session, "display_name");
      return advanceView(session, from);
    }
    case "display_name": {
      const squeezed = (session.fields.babyName ?? "").replace(/\s+/g, "").slice(0, 12);
      const keep =
        (input.buttonId === "keep" ||
          t === "1" ||
          t === "giu" ||
          t === "giu ten nay" ||
          isAffirmative(input.text ?? "")) &&
        squeezed.length >= 2;
      if (keep) {
        const from = session.step;
        session.fields.displayName = squeezed;
        go(session, "gender");
        return advanceView(session, from);
      }
      const name = parseDisplayName(input.text ?? "");
      if (!name) {
        return view(session, { messages: [gentleHint("display_name")] });
      }
      {
        const from = session.step;
        session.fields.displayName = name;
        go(session, "gender");
        return advanceView(session, from);
      }
    }
    case "gender": {
      const gender = genderOf(input);
      if (!gender) {
        return view(session, { messages: [gentleHint("gender")] });
      }
      {
        const from = session.step;
        session.fields.gender = gender;
        go(session, "age_range");
        return advanceView(session, from);
      }
    }
    case "age_range": {
      const age = ageOf(input);
      if (!age) {
        return view(session, { messages: [gentleHint("age_range")] });
      }
      {
        const from = session.step;
        session.fields.ageRange = age;
        go(session, "hobby");
        return advanceView(session, from);
      }
    }
    case "hobby": {
      const hobby = hobbyOf(input);
      if (!hobby) {
        return view(session, { messages: [gentleHint("hobby")] });
      }
      {
        const from = session.step;
        session.fields.hobby = hobby;
        go(session, "photo");
        return advanceView(session, from);
      }
    }
    case "photo": {
      if (input.type !== "image") {
        return view(session, {
          messages: ["Ba mẹ gửi 1 ảnh mặt bé rõ giúp mình nhé."],
        });
      }
      if (!input.qc || "awsError" in input.qc) {
        return view(session, {
          messages: [
            "Mình chưa kiểm tra được ảnh (lỗi dịch vụ nhận diện). Ba mẹ gửi lại hoặc thử ảnh JPG/PNG khác giúp mình nhé.",
          ],
        });
      }
      if (!input.qc.ok) return failPhoto(session, input.qc.reason);
      if (session.scenario === "error_photo_invalid") {
        const reason = FAKE_REASONS[session.fakeReasonIndex % FAKE_REASONS.length];
        session.fakeReasonIndex += 1;
        return failPhoto(session, reason);
      }
      session.fields.photoOk = true;
      go(session, "confirm");
      return view(session);
    }
    case "confirm": {
      const editTo: Record<string, StepId> = {
        edit_name: "baby_name",
        edit_display: "display_name",
        edit_gender: "gender",
        edit_age: "age_range",
        edit_hobby: "hobby",
      };
      if (session.editMenu) {
        const byNum: Record<string, string> = {
          "1": "edit_name",
          "2": "edit_display",
          "3": "edit_gender",
          "4": "edit_age",
          "5": "edit_hobby",
        };
        const pick = input.buttonId ?? byNum[t];
        if (pick && editTo[pick]) {
          session.returnTo = "confirm";
          session.editMenu = false;
          session.step = editTo[pick];
          return view(session);
        }
        return view(session);
      }
      if (input.buttonId === "edit_photo" || t === "3") {
        session.fields.photoOk = false;
        session.photoFails = 0;
        session.returnTo = "confirm";
        session.editMenu = false;
        session.step = "photo";
        return view(session);
      }
      if (input.buttonId === "edit" || t === "2") {
        session.editMenu = true;
        return view(session);
      }
      if (input.buttonId === "confirm" || t === "1" || isAffirmative(input.text ?? "")) {
        return confirmJob(session, deps);
      }
      return view(session, { messages: [gentleHint("confirm")] });
    }
    case "error": {
      const canRetry =
        session.job?.errorCode === "render_fail" && (session.job?.retries ?? 0) < 2;
      if ((input.buttonId === "retry" || t === "1") && canRetry) {
        session.job!.retries += 1;
        session.job!.status = "processing";
        session.job!.errorCode = null;
        session.job!.readyAt = deps.now() + deps.delayMs;
        session.job!.announced = false;
        session.step = "processing";
        return view(session);
      }
      if (input.buttonId === "cs" || t === "2" || (!canRetry && t === "1")) {
        session.step = "cs";
        return view(session);
      }
      if (input.buttonId === "end" || t === "3" || (!canRetry && t === "2")) {
        session.step = "end";
        return view(session);
      }
      return view(session);
    }
    case "result": {
      if (input.buttonId === "share" || t === "1") {
        return view(session, { messages: [session.job?.videoUrl ?? ""] });
      }
      if (input.buttonId === "replay" || t === "2") {
        return view(session, { restart: true });
      }
      if (input.buttonId === "learn" || t === "3") {
        return view(session, { messages: [deps.learnMoreUrl] });
      }
      return view(session);
    }
    default:
      return view(session);
  }
}

/** Skip LLM when the typed answer already fits the current step (faster + no timeout flake). */
function skipAiFor(step: StepId, text: string): boolean {
  const t = text.trim();
  if (step === "display_name" && isAffirmative(t)) return true;
  if (step === "confirm" && (isAffirmative(t) || /^\d{1,2}$/.test(t))) return true;
  if (step === "gender" || step === "age_range" || step === "hobby" || step === "confirm") {
    return /^\d{1,2}$/.test(t);
  }
  if (step === "baby_name" || step === "display_name") {
    if (/,| và /i.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 2) return false;
    return step === "baby_name"
      ? parseBabyName(t) != null
      : parseDisplayName(t) != null;
  }
  return false;
}

export async function applyTurn(
  inputSession: Session,
  input: TurnInput,
  deps: MachineDeps,
): Promise<TurnResult> {
  const session = structuredClone(inputSession);
  if (
    session.mode === "flow" &&
    session.ai &&
    deps.extract &&
    input.type === "text" &&
    input.text &&
    COLLECT.includes(session.step) &&
    !skipAiFor(session.step, input.text)
  ) {
    try {
      const from = session.step;
      const extracted = await deps.extract(session.step, input.text, session);
      const applied = applyExtracted(session, extracted);
      if (session.step === "confirm" && extracted.confirm) return confirmJob(session, deps);
      if (applied && session.step !== "confirm") {
        session.step = nextIncomplete(session);
        session.editMenu = false;
        return advanceView(session, from);
      }
      if (!applied) {
        // one soft tip only — avoid stacking tip + full form prompt (feels like a wall)
        return view(session, {
          messages: [extracted.reply ?? gentleHint(session.step)],
        });
      }
    } catch {
      // LLM timeout / bad JSON → soft Vietnamese re-ask
      return view(session, {
        messages: [gentleHint(session.step)],
      });
    }
  }
  return applyRigid(session, input, deps);
}

export function settle(inputSession: Session, deps: MachineDeps): TurnResult {
  const session = structuredClone(inputSession);
  if (session.step !== "processing" || !session.job) {
    return {
      session,
      messages: [],
      buttons: [],
      jobId: session.job?.id ?? null,
      restart: false,
    };
  }
  if (deps.now() < session.job.readyAt) {
    return { session, messages: [], buttons: [], jobId: session.job.id, restart: false };
  }
  if (session.scenario === "error_render") {
    session.job.status = "error";
    session.job.errorCode = "render_fail";
    session.job.videoUrl = null;
    session.step = "error";
    return view(session);
  }
  const gender = session.job.genderSnap ?? session.fields.gender;
  const pool = videoPoolForGender(gender, deps);
  if (pool.length === 0) {
    session.job.status = "error";
    session.job.errorCode = "config";
    session.job.videoUrl = null;
    session.step = "error";
    return view(session);
  }
  session.job.videoUrl = deps.pickVideo(pool);
  session.job.previewUrl = deps.previewUrl;
  session.job.status = "done";
  session.job.errorCode = null;
  session.step = "result";
  return view(session);
}
