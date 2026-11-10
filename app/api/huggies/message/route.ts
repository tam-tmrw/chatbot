import { hasDemoCookie } from "@/lib/demo-access";
import { applyGuideTurn } from "@/lib/huggies/agent";
import { promptFor } from "@/lib/huggies/copy";
import { huggiesDeps, huggiesGuideDeps } from "@/lib/huggies/env";
import { imageMinEdge } from "@/lib/huggies/image";
import { applyTurn, freshSession } from "@/lib/huggies/machine";
import { judgeFace, QC_THRESHOLDS } from "@/lib/huggies/qc";
import { detectFaceFacts } from "@/lib/huggies/rekognition";
import {
  createHuggiesSession,
  getHuggiesSession,
  saveHuggiesSession,
} from "@/lib/huggies/store";
import type { QcOutcome, TurnInput } from "@/lib/huggies/types";

export async function POST(req: Request) {
  if (!hasDemoCookie(req, "huggies")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    sessionId?: string;
    type?: TurnInput["type"];
    text?: string;
    buttonId?: string;
    imageBase64?: string;
    mime?: string;
  };
  const current = body.sessionId ? getHuggiesSession(body.sessionId) : undefined;
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });

  let qc: QcOutcome | undefined;
  // Image QC (AWS) only at the photo step: no third-party calls before consent/text.
  if (body.type === "image" && current.step === "photo") {
    const mime = body.mime ?? "";
    if (mime !== "image/jpeg" && mime !== "image/png") {
      qc = { ok: false, reason: "bad_type" };
    } else {
      const bytes = Buffer.from(body.imageBase64 ?? "", "base64");
      if (bytes.byteLength > QC_THRESHOLDS.maxBytes) qc = { ok: false, reason: "too_large" };
      else {
        const minEdge = imageMinEdge(bytes);
        if (minEdge == null) qc = { ok: false, reason: "low_res" };
        else {
          try {
            const facts = await detectFaceFacts(bytes);
            qc = judgeFace({ ...facts, minEdge });
          } catch (err) {
            console.error("[huggies] rekognition failed", err);
            // ponytail: pitch demo continues when AWS keys/region are broken;
            // set HUGGIES_REKOGNITION_SOFT=0 to surface awsError instead.
            const soft = process.env.HUGGIES_REKOGNITION_SOFT !== "0";
            const detail = `${(err as { name?: string })?.name ?? ""} ${err instanceof Error ? err.message : String(err)}`;
            const authFail =
              /UnrecognizedClient|InvalidClientTokenId|ExpiredToken|CredentialsProvider|AccessDenied|security token/i.test(
                detail,
              );
            qc = soft && authFail ? { ok: true } : { awsError: true };
          }
        }
      }
    }
  }

  const turnInput = {
    type: body.type ?? "text",
    text: body.text,
    buttonId: body.buttonId,
    qc,
  } satisfies TurnInput;
  const result =
    current.mode === "guide"
      ? await applyGuideTurn(current, turnInput, huggiesGuideDeps())
      : await applyTurn(current, turnInput, huggiesDeps(current.ai));

  if (result.restart) {
    const next = freshSession({
      id: crypto.randomUUID(),
      scenario: current.scenario,
      channel: current.channel,
      mode: current.mode,
      termsVersion: current.fields.termsVersion,
    });
    createHuggiesSession(next);
    const prompt = promptFor(next);
    return Response.json({
      sessionId: next.id,
      step: next.step,
      mode: next.mode,
      messages: [prompt.text],
      buttons: prompt.buttons,
      jobId: null,
      restart: true,
    });
  }

  saveHuggiesSession(result.session);
  return Response.json({
    sessionId: result.session.id,
    step: result.session.step,
    mode: result.session.mode,
    messages: result.messages,
    buttons: result.buttons,
    jobId: result.jobId,
    restart: false,
  });
}
