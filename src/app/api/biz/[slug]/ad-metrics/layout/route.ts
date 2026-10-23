// Cấu hình bảng Chỉ số quảng cáo — mỗi người, mỗi nền tảng một bố cục riêng.
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import {
  AD_COLUMNS,
  AD_LEVELS,
  AD_PLATFORMS,
  DEFAULT_LAYOUT,
  normalizeLayout,
  type AdPlatform,
  type TableLayout,
} from "@/lib/ad-table";
import { validateFormula, type CustomField } from "@/lib/formula";

export const runtime = "nodejs";

const ALLOWED_REFS = AD_COLUMNS.map((c) => c.key);

async function allowed(slug: string) {
  const m = await getMembership(slug);
  if (!m) return null;
  const perms = m.member.permissions as string[];
  const can = m.member.role === "owner" || perms.includes("ad_metrics.access");
  return can ? m : null;
}

function isPlatform(value: unknown): value is AdPlatform {
  return AD_PLATFORMS.some((p) => p.key === value);
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rows = await db.select().from(schema.adTableLayouts)
    .where(and(eq(schema.adTableLayouts.bizId, m.biz.id), eq(schema.adTableLayouts.userId, m.member.userId)));

  const layouts: Record<string, TableLayout> = {};
  for (const p of AD_PLATFORMS) {
    const row = rows.find((r) => r.platform === p.key);
    layouts[p.key] = normalizeLayout(p.key, row ?? { ...DEFAULT_LAYOUT, platform: p.key });
  }
  return Response.json({
    layouts,
    catalog: AD_COLUMNS,
    levels: AD_LEVELS,
    platforms: AD_PLATFORMS,
    defaults: { ...DEFAULT_LAYOUT, platform: "meta" },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const platform = body.platform;
  if (!isPlatform(platform)) return Response.json({ detail: "Nền tảng không hợp lệ" }, { status: 400 });

  if (body.reset) {
    await db.delete(schema.adTableLayouts)
      .where(and(
        eq(schema.adTableLayouts.bizId, m.biz.id),
        eq(schema.adTableLayouts.userId, m.member.userId),
        eq(schema.adTableLayouts.platform, platform),
      ));
    await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "ad_layout.reset", objectType: "ad_layout", objectId: platform });
    return Response.json({ ok: true, layout: normalizeLayout(platform, { ...DEFAULT_LAYOUT, platform }) });
  }

  // Kiểm tra từng trường tuỳ chỉnh trước khi lưu.
  const rawFields: unknown[] = Array.isArray(body.customFields) ? body.customFields : [];
  if (rawFields.length > 8) return Response.json({ detail: "Tối đa 8 trường tuỳ chỉnh" }, { status: 400 });
  for (const f of rawFields as Partial<CustomField>[]) {
    const name = String(f?.name ?? "").trim();
    if (!name) return Response.json({ detail: "Trường tuỳ chỉnh thiếu tên" }, { status: 400 });
    const check = validateFormula(String(f?.formula ?? ""), ALLOWED_REFS);
    if (!check.ok) return Response.json({ detail: `${name}: ${check.error}` }, { status: 400 });
    if (!String(f?.key ?? "").startsWith("cf_")) return Response.json({ detail: `${name}: mã trường không hợp lệ` }, { status: 400 });
  }

  const layout = normalizeLayout(platform, {
    columns: body.columns,
    mergeAccounts: body.mergeAccounts,
    defaultLevel: body.defaultLevel,
    customFields: rawFields,
  });

  await db.insert(schema.adTableLayouts).values({
    bizId: m.biz.id,
    userId: m.member.userId,
    platform,
    columns: layout.columns,
    mergeAccounts: layout.mergeAccounts,
    defaultLevel: layout.defaultLevel,
    customFields: layout.customFields as any,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [schema.adTableLayouts.bizId, schema.adTableLayouts.userId, schema.adTableLayouts.platform],
    set: {
      columns: layout.columns,
      mergeAccounts: layout.mergeAccounts,
      defaultLevel: layout.defaultLevel,
      customFields: layout.customFields as any,
      updatedAt: new Date(),
    },
  });

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "ad_layout.update",
    objectType: "ad_layout",
    objectId: platform,
    detail: { columns: layout.columns.length, customFields: layout.customFields.length, merge: layout.mergeAccounts },
  });
  return Response.json({ ok: true, layout });
}
