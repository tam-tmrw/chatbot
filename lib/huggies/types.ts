export type StepId =
  | "welcome"
  | "consent"
  | "baby_name"
  | "display_name"
  | "gender"
  | "age_range"
  | "hobby"
  | "photo"
  | "confirm"
  | "processing"
  | "result"
  | "error"
  | "cs"
  | "end";

export type Scenario = "success" | "error_photo_invalid" | "error_render";
/** Web pitch surface only — not a live Zalo/Messenger wire. */
export type DemoChannel = "zalo" | "messenger";
export type DemoMode = "flow" | "guide";
export type GuideMessage = { role: "user" | "assistant"; content: string };
export type Gender = "boy" | "girl" | "unspecified";
export type AgeRange = "<1" | "1-2" | "2-3" | ">3";
export type HobbyId =
  | "cars"
  | "animals"
  | "music"
  | "dance"
  | "sports"
  | "princess"
  | "space"
  | "art"
  | "toys"
  | "nature";

export type QcReason =
  | "no_face"
  | "multi_face"
  | "other_person"
  | "blurry"
  | "too_dark"
  | "covered"
  | "low_res"
  | "not_frontal"
  | "bad_type"
  | "too_large";

export type FaceFacts = {
  faceCount: number;
  personCount: number;
  confidence: number;
  brightness: number;
  sharpness: number;
  yaw: number;
  pitch: number;
  occluded: boolean;
  minEdge: number;
};

export type Button = { id: string; label: string };

export type Fields = {
  consent: boolean;
  consentAt: string | null;
  termsVersion: string;
  babyName: string | null;
  displayName: string | null;
  gender: Gender | null;
  ageRange: AgeRange | null;
  hobby: HobbyId | null;
  photoOk: boolean;
};

export type Job = {
  id: string;
  status: "processing" | "done" | "error";
  templateId: string | null;
  videoUrl: string | null;
  previewUrl: string | null;
  errorCode: "render_fail" | "config" | null;
  retries: number;
  readyAt: number;
  announced: boolean;
};

export type Session = {
  id: string;
  scenario: Scenario;
  channel: DemoChannel;
  mode: DemoMode;
  guideHistory: GuideMessage[];
  /** true iff mode === "flow" */
  ai: boolean;
  step: StepId;
  fields: Fields;
  photoFails: number;
  fakeReasonIndex: number;
  editMenu: boolean;
  returnTo: StepId | null;
  job: Job | null;
};

export type QcOutcome =
  | { ok: true }
  | { ok: false; reason: QcReason }
  | { awsError: true };

export type TurnInput = {
  type: "text" | "button" | "image";
  text?: string;
  buttonId?: string;
  qc?: QcOutcome;
};

export type Extracted = {
  babyName?: string | null;
  displayName?: string | null;
  gender?: Gender | null;
  ageRange?: AgeRange | null;
  hobby?: HobbyId | null;
  confirm?: boolean;
  reply?: string | null;
};

export type TurnResult = {
  session: Session;
  messages: string[];
  buttons: Button[];
  jobId: string | null;
  restart: boolean;
};
