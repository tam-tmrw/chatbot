import { codeMatches, demoCookieHeader, type DemoId } from "@/lib/demo-access";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const demo = (body as { demo?: string }).demo;
  const code = (body as { code?: string }).code ?? "";
  if (demo !== "hyundai" && demo !== "huggies") {
    return Response.json({ error: "Bad demo" }, { status: 400 });
  }
  if (!codeMatches(demo as DemoId, code)) {
    return Response.json({ error: "Sai mã" }, { status: 401 });
  }
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": demoCookieHeader(demo) },
  });
}
