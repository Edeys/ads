import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { providerById, buildSecretAndMeta, checkHealth } from "@/lib/providers";
import { countAdAccounts, countSalesConnections, getBizPlan, quotaError, quotasEnforced } from "@/lib/plan-quota";

export const runtime = "nodejs";

async function guard(slug: string) {
  const m = await getMembership(slug);
  if (!m) return null;
  const isOwner = m.member.role === "owner";
  if (!isOwner && !(m.member.permissions as string[]).includes("credentials.access")) return null;
  return m;
}

// POST /api/biz/:slug/connections — tạo kết nối mới
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await guard(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const provider = providerById(String(body.provider ?? ""));
  if (!provider || provider.comingSoon) {
    return Response.json({ error: "provider_invalid" }, { status: 400 });
  }

  try {
    const { secret, encSecret, meta } = buildSecretAndMeta(provider, body.values ?? {});
    const health = await checkHealth({ provider: provider.id, secret, meta });
    const mergedMeta = { ...meta, ...(health.meta ?? {}) } as Record<string, unknown>;
    if (quotasEnforced()) {
      const { quota } = await getBizPlan(m.biz.id);
      if (provider.group === "ads") {
        const lists = ["adAccounts", "customers", "advertisers"]
          .map((k) => mergedMeta[k])
          .filter(Array.isArray) as unknown[][];
        const adding = Math.max(1, lists.reduce((a, list) => a + list.length, 0));
        const current = await countAdAccounts(m.biz.id);
        if (current + adding > quota.tkqc) return quotaError("tkqc", current, adding, quota.tkqc);
      } else if (provider.group === "sales") {
        const current = await countSalesConnections(m.biz.id);
        if (current + 1 > quota.qlbh) return quotaError("qlbh", current, 1, quota.qlbh);
      }
    }

    const [row] = await db.insert(schema.connections).values({
      bizId: m.biz.id,
      provider: provider.id,
      name: String(body.name || provider.label),
      secret: { enc: encSecret },
      meta: mergedMeta,
      health: health.health,
      lastCheckedAt: new Date(),
    }).returning();
    await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "connection.create", objectType: "connection", objectId: row.id, detail: { provider: provider.id, health: health.health } });
    return Response.json({ id: row.id, health: health.health });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

// GET /api/biz/:slug/connections — list (không trả secret)
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await guard(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.select({
    id: schema.connections.id, provider: schema.connections.provider, name: schema.connections.name,
    meta: schema.connections.meta, health: schema.connections.health,
    lastCheckedAt: schema.connections.lastCheckedAt, createdAt: schema.connections.createdAt,
  }).from(schema.connections).where(eq(schema.connections.bizId, m.biz.id));
  return Response.json(rows);
}
