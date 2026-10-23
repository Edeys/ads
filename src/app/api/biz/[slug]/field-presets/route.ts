// Bộ chỉ số (field presets) — danh sách + tạo/xoá preset tự tạo theo từng nền tảng.
// Quy tắc Done.vn: preset không sửa được sau khi tạo; muốn đổi thì tạo bộ mới rồi xoá bộ cũ.
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { PRESET_PROVIDERS } from "@/lib/field-catalog";
import {
  PROVIDER_LABEL,
  countFields,
  entitiesOf,
  listSystemPresets,
  normalizeConfig,
  type EntityFieldConfig,
} from "@/lib/field-presets";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  if (!m) return null;
  const perms = m.member.permissions as string[];
  return m.member.role === "owner" || perms.includes("mcp_keys.access") || perms.includes("mcp_server.access") ? m : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const custom = await db.select().from(schema.fieldPresets)
    .where(eq(schema.fieldPresets.bizId, m.biz.id)).orderBy(desc(schema.fieldPresets.id));

  const presets = [
    ...listSystemPresets(),
    ...custom.map((c) => {
      const config = normalizeConfig(c.provider, (c.config as EntityFieldConfig) ?? {});
      return {
        id: c.id,
        provider: c.provider,
        name: c.name,
        description: "",
        config,
        kind: "custom" as const,
        isSystem: false,
        fieldCount: countFields(config),
      };
    }),
  ];

  return Response.json({
    providers: PRESET_PROVIDERS.map((p) => ({
      key: p.key,
      label: p.label,
      initial: p.initial,
      entities: entitiesOf(p.key).map((e) => ({
        entity: e.entity,
        label: e.label,
        fieldCount: e.fields.length,
        minimalCount: e.minimal.length,
        fields: e.fields,
        minimal: e.minimal,
      })),
    })),
    presets: presets.map((p) => ({ ...p, fieldCount: countFields(p.config) })),
    labels: PROVIDER_LABEL,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const provider = String(b.provider ?? "");
  if (!PRESET_PROVIDERS.some((p) => p.key === provider)) {
    return Response.json({ detail: "Nền tảng không hợp lệ" }, { status: 400 });
  }
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name) return Response.json({ detail: "Thiếu tên bộ chỉ số" }, { status: 400 });

  const config = normalizeConfig(provider, b.config);
  if (countFields(config) === 0) {
    return Response.json({ detail: "Chọn ít nhất một trường cho một loại dữ liệu" }, { status: 400 });
  }

  const [row] = await db.insert(schema.fieldPresets).values({
    bizId: m.biz.id,
    provider,
    name,
    fields: [],
    config: config as Record<string, string[]>,
    isSystem: false,
  }).returning();

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "field_preset.create",
    objectType: "field_preset",
    objectId: row.id,
    detail: { provider, entities: Object.keys(config).length, fields: countFields(config) },
  });
  return Response.json({ id: row.id });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ detail: "Thiếu id" }, { status: 400 });
  const [row] = await db.select().from(schema.fieldPresets).where(eq(schema.fieldPresets.id, id)).limit(1);
  if (!row || row.bizId !== m.biz.id || row.isSystem) {
    return Response.json({ detail: "Không tìm thấy bộ chỉ số" }, { status: 404 });
  }
  // Key đã tạo vẫn chạy độc lập: cấu hình đã được sao chép vào key lúc tạo.
  await db.delete(schema.fieldPresets).where(eq(schema.fieldPresets.id, id));
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "field_preset.delete", objectType: "field_preset", objectId: id });
  return Response.json({ ok: true });
}
