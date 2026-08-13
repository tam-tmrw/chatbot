import { listLeads } from "@/lib/leads/service";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get("x-admin-secret") !== secret) {
    return unauthorized();
  }
  const rows = await listLeads();
  return Response.json({ leads: rows });
}
