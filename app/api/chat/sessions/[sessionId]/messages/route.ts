import { NextResponse } from "next/server";
import {
  loadMessagesPage,
  sessionExists,
} from "@/lib/conversation/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { sessionId } = await ctx.params;
  if (!(await sessionExists(sessionId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 20);
  const beforeRaw = url.searchParams.get("beforeId");
  const beforeId =
    beforeRaw != null && beforeRaw !== ""
      ? Number(beforeRaw)
      : undefined;

  const page = await loadMessagesPage(sessionId, {
    limit: Number.isFinite(limitRaw) ? limitRaw : 20,
    beforeId:
      beforeId != null && Number.isFinite(beforeId) ? beforeId : undefined,
  });

  return NextResponse.json(page);
}
