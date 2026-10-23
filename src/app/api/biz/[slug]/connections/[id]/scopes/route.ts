// Quản lý quyền (scope) của một kết nối quảng cáo.
//
// GET  /api/biz/:slug/connections/:id/scopes  -> quyền đã cấp / thiếu / cần review
// POST /api/biz/:slug/connections/:id/scopes  -> cấp thêm quyền (re-authorize)
//
// Việc "cấp thêm quyền" là bắt buộc với Meta: app ở chế độ Development chỉ
// cấp được quyền cơ bản, và quyền publish/engage phải qua App Review. Người
// dùng cần đường đi rõ ràng thay vì thấy màn trắng sau khi Meta báo lỗi.
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import {
  PROVIDER_SCOPES,
  grantedKeys,
  missingScopes,
  type ScopeProvider,
} from "@/lib/oauth-scopes";

export const runtime = "nodejs";

const CONNECTION_PROVIDER: Record<string, ScopeProvider> = {
  meta_ads: "meta",
  google_ads: "google",
  tiktok_ads: "tiktok",
  google_sheets: "sheets",
};

async function guard(slug: string) {
  const m = await getMembership(slug);
  if (!m) return null;
  const isOwner = m.member.role === "owner";
  if (!isOwner && !(m.member.permissions as string[]).includes("credentials.access")) return null;
  return m;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await guard(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const [conn] = await db.select().from(schema.connections)
    .where(eq(schema.connections.id, id)).limit(1);
  if (!conn || conn.bizId !== m.biz.id) return Response.json({ error: "not_found" }, { status: 404 });

  const provider = CONNECTION_PROVIDER[conn.provider];
  if (!provider) {
    return Response.json({ provider: conn.provider, supported: false, scopes: [], granted: [], missing: [] });
  }

  const meta = (conn.meta ?? {}) as Record<string, unknown>;
  const stored = (meta.grantedScopes as string[]) ?? [];
  // Nếu chưa lưu scope (kết nối cũ), coi như chưa cấp gì để người dùng thấy
  // đúng tình trạng thay vì tưởng đã có đủ quyền.
  const granted = grantedKeys(provider, stored);
  const missing = missingScopes(provider, granted);
  const defs = PROVIDER_SCOPES[provider];

  return Response.json({
    provider: conn.provider,
    scopeProvider: provider,
    supported: true,
    granted,
    missing: missing.map((s) => s.key),
    needsReview: defs.filter((s) => s.needsReview).map((s) => s.key),
    scopes: defs.map((s) => ({
      ...s,
      granted: granted.includes(s.key),
    })),
  });
}

// POST: trả về URL để người dùng cấp thêm quyền.
// keys = danh sách scope key cần cấp (mặc định: toàn bộ scope còn thiếu).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await guard(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const keys: string[] = Array.isArray(body.keys) ? body.keys.map(String) : [];

  const [conn] = await db.select().from(schema.connections)
    .where(eq(schema.connections.id, id)).limit(1);
  if (!conn || conn.bizId !== m.biz.id) return Response.json({ error: "not_found" }, { status: 404 });

  const provider = CONNECTION_PROVIDER[conn.provider];
  if (!provider) return Response.json({ error: "scope_not_supported" }, { status: 400 });

  const meta = (conn.meta ?? {}) as Record<string, unknown>;
  const granted = grantedKeys(provider, (meta.grantedScopes as string[]) ?? []);
  const target = keys.length ? keys : missingScopes(provider, granted).map((s) => s.key);
  if (!target.length) return Response.json({ error: "nothing_to_grant" }, { status: 400 });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const startPath =
    conn.provider === "meta_ads" ? "meta" : conn.provider === "google_ads" ? "google" : "tiktok";
  const url = `${appUrl}/api/connect/${startPath}/start?slug=${encodeURIComponent(slug)}&conn=${encodeURIComponent(conn.id)}&scope=${encodeURIComponent(target.join(","))}`;

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "connection.regrant",
    objectType: "connection",
    objectId: conn.id,
    detail: { provider: conn.provider, scopes: target },
  });

  return Response.json({ url, scopes: target });
}
