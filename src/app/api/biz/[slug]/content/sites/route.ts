import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

// GET /api/biz/:slug/content/sites — Lấy danh sách website đích đã kết nối
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rawSites = await db
    .select({
      id: schema.sites.id,
      name: schema.sites.name,
      type: schema.sites.type,
      endpointUrl: schema.sites.endpointUrl,
      authType: schema.sites.authType,
      status: schema.sites.status,
      meta: schema.sites.meta,
      createdAt: schema.sites.createdAt,
    })
    .from(schema.sites)
    .where(eq(schema.sites.bizId, m.biz.id))
    .orderBy(desc(schema.sites.createdAt));

  return Response.json({ sites: rawSites });
}

// POST /api/biz/:slug/content/sites — Kết nối CMS mới (WordPress, Ghost, Webflow...)
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "wordpress").trim();
  const endpointUrl = String(body.endpointUrl ?? "").trim();
  const authType = String(body.authType ?? "application_password").trim();
  const credentials = (body.credentials ?? {}) as Record<string, string>;

  if (!name || !endpointUrl) {
    return Response.json({ error: "name_and_endpoint_required" }, { status: 400 });
  }

  // Mã hóa thông tin đăng nhập trước khi lưu PGlite
  const credentialsEnc = encryptSecret(credentials);

  const [site] = await db
    .insert(schema.sites)
    .values({
      bizId: m.biz.id,
      name,
      type,
      endpointUrl,
      authType,
      credentialsEnc,
      meta: body.meta ?? {},
      status: "active",
    })
    .returning();

  return Response.json({
    site: {
      id: site.id,
      name: site.name,
      type: site.type,
      endpointUrl: site.endpointUrl,
      authType: site.authType,
      status: site.status,
      createdAt: site.createdAt,
    },
  });
}
