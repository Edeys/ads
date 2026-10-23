// PUT/DELETE /api/biz/:slug/ad-metrics/views/:platform
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import {
  CUSTOM_FIELD_KEY_RE,
  MAX_CUSTOM_DECIMALS,
  MAX_CUSTOM_FIELDS,
  MAX_CUSTOM_LABEL_LENGTH,
  MAX_VIEW_COLUMNS,
  isPlatform,
  metricMap,
} from "@/lib/ad-catalog";
import { normalizeView } from "@/lib/ad-views";
import { validateFormula, type FormulaFormat } from "@/lib/formula";

export const runtime = "nodejs";

const FORMATS: FormulaFormat[] = ["number", "currency", "percent", "decimal"];

async function allowed(slug: string) {
  const m = await getMembership(slug);
  if (!m) return null;
  const perms = m.member.permissions as string[];
  return m.member.role === "owner" || perms.includes("ad_metrics.access") ? m : null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string; platform: string }> }) {
  const { slug, platform } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!isPlatform(platform)) return Response.json({ detail: "Nền tảng không hợp lệ." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const errors: string[] = [];

  const columns = Array.isArray(body.columns) ? body.columns : [];
  if (columns.length > MAX_VIEW_COLUMNS) errors.push(`Tối đa ${MAX_VIEW_COLUMNS} cột hiển thị.`);

  const defaults = metricMap(platform);
  for (const c of columns) {
    if (typeof c !== "string" || !defaults.has(c)) errors.push(`Cột "${String(c)}" không có trên nền tảng này.`);
  }

  const fields = Array.isArray(body.custom_fields) ? body.custom_fields : Array.isArray(body.customFields) ? body.customFields : [];
  if (fields.length > MAX_CUSTOM_FIELDS) errors.push(`Tối đa ${MAX_CUSTOM_FIELDS} trường tuỳ chỉnh.`);
  const seen = new Set<string>();
  for (const f of fields) {
    if (!f || typeof f !== "object") {
      errors.push("Trường tuỳ chỉnh không hợp lệ.");
      continue;
    }
    if (typeof f.key !== "string" || !CUSTOM_FIELD_KEY_RE.test(f.key)) {
      errors.push("Mã trường phải bắt đầu bằng cf_, sau đó 1-40 ký tự a-z, 0-9 hoặc dấu gạch dưới.");
      continue;
    }
    if (seen.has(f.key)) errors.push(`Mã trường "${f.key}" bị trùng.`);
    seen.add(f.key);
    if (typeof f.label === "string" && f.label.length > MAX_CUSTOM_LABEL_LENGTH) {
      errors.push(`Tên trường tối đa ${MAX_CUSTOM_LABEL_LENGTH} ký tự.`);
    }
    const check = validateFormula(String(f.formula ?? ""), [...defaults.keys()]);
    if (!check.ok) errors.push(`${f.key}: ${check.error}`);
    if (typeof f.decimals === "number" && (f.decimals < 0 || f.decimals > MAX_CUSTOM_DECIMALS)) {
      errors.push(`${f.key}: số thập phân trong khoảng 0-${MAX_CUSTOM_DECIMALS}.`);
    }
  }

  if (errors.length) return Response.json({ detail: errors.map((msg) => ({ msg })) }, { status: 422 });

  const view = normalizeView(platform, {
    columns,
    highlights: body.highlights,
    merge_accounts: body.merge_accounts ?? body.mergeAccounts,
    default_level: body.default_level ?? body.defaultLevel,
    custom_fields: fields,
  });

  await db
    .insert(schema.adMetricViews)
    .values({
      bizId: m.biz.id,
      userId: m.member.userId,
      platform,
      columns: view.columns,
      highlights: view.highlights,
      mergeAccounts: view.merge_accounts,
      defaultLevel: view.default_level,
      customFields: view.custom_fields,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.adMetricViews.bizId, schema.adMetricViews.userId, schema.adMetricViews.platform],
      set: {
        columns: view.columns,
        highlights: view.highlights,
        mergeAccounts: view.merge_accounts,
        defaultLevel: view.default_level,
        customFields: view.custom_fields,
        updatedAt: new Date(),
      },
    });

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "ad_view.update",
    objectType: "ad_view",
    objectId: platform,
    detail: { columns: view.columns.length, custom_fields: view.custom_fields.length },
  });

  return Response.json({ ok: true, view });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; platform: string }> }) {
  const { slug, platform } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!isPlatform(platform)) return Response.json({ detail: "Nền tảng không hợp lệ." }, { status: 400 });

  await db
    .delete(schema.adMetricViews)
    .where(
      and(
        eq(schema.adMetricViews.bizId, m.biz.id),
        eq(schema.adMetricViews.userId, m.member.userId),
        eq(schema.adMetricViews.platform, platform),
      ),
    );

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "ad_view.reset",
    objectType: "ad_view",
    objectId: platform,
  });

  return Response.json({ ok: true, view: null });
}
