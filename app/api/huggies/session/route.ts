import { hasDemoCookie } from "@/lib/demo-access";
import { promptFor } from "@/lib/huggies/copy";
import { freshSession } from "@/lib/huggies/machine";
import { createHuggiesSession } from "@/lib/huggies/store";
import type { DemoChannel, DemoMode, Scenario } from "@/lib/huggies/types";

export async function POST(req: Request) {
  if (!hasDemoCookie(req, "huggies")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    scenario?: Scenario;
    ai?: boolean;
    mode?: DemoMode;
    channel?: DemoChannel;
  };
  const scenario = body.scenario ?? "success";
  const channel = body.channel === "messenger" ? "messenger" : "zalo";
  const mode: DemoMode =
    body.mode ?? (body.ai === false ? "guide" : "flow");
  const session = freshSession({
    id: crypto.randomUUID(),
    scenario,
    channel,
    mode,
    termsVersion: process.env.HUGGIES_TERMS_VERSION ?? "huggies-video-2026-11",
  });
  createHuggiesSession(session);
  const prompt = promptFor(session);
  return Response.json({
    sessionId: session.id,
    step: session.step,
    channel: session.channel,
    messages: [prompt.text],
    buttons: prompt.buttons,
  });
}
