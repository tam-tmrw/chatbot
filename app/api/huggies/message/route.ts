import { hasDemoCookie } from "@/lib/demo-access";
import { promptFor } from "@/lib/huggies/copy";
import { huggiesDeps } from "@/lib/huggies/env";
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
  if (body.type === "image") {
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
          } catch {
            qc = { awsError: true };
          }
        }
      }
    }
  }

  const result = await applyTurn(
    current,
    { type: body.type ?? "text", text: body.text, buttonId: body.buttonId, qc },
    huggiesDeps(current.ai),
  );

  if (result.restart) {
    const next = freshSession({
      id: crypto.randomUUID(),
      scenario: current.scenario,
      ai: current.ai,
      termsVersion: current.fields.termsVersion,
    });
    createHuggiesSession(next);
    const prompt = promptFor(next);
    return Response.json({
      sessionId: next.id,
      step: next.step,
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
    messages: result.messages,
    buttons: result.buttons,
    jobId: result.jobId,
    restart: false,
  });
}
