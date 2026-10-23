import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { metaToken } from "@/lib/meta-ads";

export const runtime = "nodejs";

// GET /api/biz/:slug/meta/entities?conn=<id>&acc=<act_xxx>&level=campaign|adset
// List campaigns/adsets ACTIVE — dùng cho wizard chọn target.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const connId = q.get("conn") ?? "", acc = q.get("acc") ?? "", level = q.get("level") ?? "campaign";
  const [conn] = await db.select().from(schema.connections).where(eq(schema.connections.id, connId)).limit(1);
  if (!conn || conn.bizId !== m.biz.id) return Response.json({ error: "conn_not_found" }, { status: 404 });

  const token = await metaToken(connId);

  if (level === "posts") {
    const res = await fetch(`https://graph.facebook.com/v21.0/${acc}/posts?fields=id,message,created_time,permalink_url&limit=30&access_token=${token}`);
    const j = await res.json();
    if (j.error) return Response.json({ error: j.error.message }, { status: 400 });
    return Response.json(j.data ?? []);
  }

  const fields = level === "campaign"
    ? "id,name,status,effective_status,daily_budget,objective"
    : "id,name,status,effective_status,daily_budget,campaign_id";
  const edge = level === "campaign" ? "campaigns" : "adsets";
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${acc}/${edge}?fields=${fields}&effective_status=["ACTIVE","PAUSED"]&limit=200&access_token=${token}`
  );
  const j = await res.json();
  if (j.error) return Response.json({ error: j.error.message }, { status: 400 });
  return Response.json(j.data ?? []);
}
