import { hasDemoCookie } from "@/lib/demo-access";
import { promptFor } from "@/lib/huggies/copy";
import { freshSession } from "@/lib/huggies/machine";
import { createHuggiesSession } from "@/lib/huggies/store";
import type { Scenario } from "@/lib/huggies/types";

export async function POST(req: Request) {
  if (!hasDemoCookie(req, "huggies")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { scenario?: Scenario; ai?: boolean };
  const scenario = body.scenario ?? "success";
  const session = freshSession({
    id: crypto.randomUUID(),
    scenario,
    ai: body.ai !== false,
    termsVersion: process.env.HUGGIES_TERMS_VERSION ?? "huggies-video-2026-11",
  });
  createHuggiesSession(session);
  const prompt = promptFor(session);
  return Response.json({
    sessionId: session.id,
    step: session.step,
    messages: [prompt.text],
    buttons: prompt.buttons,
  });
}
