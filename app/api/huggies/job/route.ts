import { hasDemoCookie } from "@/lib/demo-access";
import { huggiesDeps } from "@/lib/huggies/env";
import { settle } from "@/lib/huggies/machine";
import { getHuggiesSession, saveHuggiesSession } from "@/lib/huggies/store";

export async function GET(req: Request) {
  if (!hasDemoCookie(req, "huggies")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
  const current = getHuggiesSession(sessionId);
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });
  const wasProcessing = current.step === "processing";
  const result = settle(current, huggiesDeps(current.ai));
  const show = wasProcessing && result.session.step !== "processing";
  if (show && result.session.job) result.session.job.announced = true;
  saveHuggiesSession(result.session);
  return Response.json({
    step: result.session.step,
    messages: show ? result.messages : [],
    buttons: show ? result.buttons : [],
    jobId: result.jobId,
    job: result.session.job,
  });
}
