import { getLeadWithMessages } from "@/lib/leads/service";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get("x-admin-secret") !== secret) {
    return unauthorized();
  }
  const { id } = await params;
  const data = await getLeadWithMessages(Number(id));
  if (!data) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(data);
}
