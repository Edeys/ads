// Cấu hình ứng dụng OAuth cho bản self-hosted (đặc biệt là bản desktop).
//
// GET  → trả trạng thái hiện tại (giá trị đã che) + redirect URI cần đăng ký.
// POST → lưu vào file cấu hình runtime (%APPDATA%\AdsSync\oauth.env trong bản
//       desktop). Cần khởi động lại app để server nạp lại env.
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import {
  OAUTH_CONFIG_FIELDS,
  PROVIDER_LABELS,
  type ConfigProvider,
  canWriteConfig,
  configFile,
  currentAppUrl,
  currentValues,
  maskValue,
  redirectUri,
  writeConfigValues,
} from "@/lib/self-hosted-config";

export const runtime = "nodejs";

const PROVIDERS: ConfigProvider[] = ["meta", "tiktok", "google"];

/** Chỉ chủ Biz (owner) của bản self-hosted mới được sửa cấu hình hệ thống. */
async function guard() {
  if (process.env.SELF_HOSTED !== "true") return null;
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;
  const rows = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(and(eq(schema.members.userId, userId), eq(schema.members.role, "owner")))
    .limit(1);
  if (rows.length === 0) return null;
  return { userId };
}

export async function GET() {
  const g = await guard();
  if (!g) return Response.json({ error: "forbidden" }, { status: 403 });

  const values = currentValues();
  return Response.json({
    appUrl: currentAppUrl(),
    configFile: configFile(),
    canWrite: canWriteConfig(),
    restartRequired: false,
    providers: PROVIDERS.map((p) => ({
      id: p,
      label: PROVIDER_LABELS[p],
      redirectUri: redirectUri(p),
    })),
    fields: OAUTH_CONFIG_FIELDS.map((f) => ({
      key: f.key,
      label: f.label,
      provider: f.provider,
      secret: f.secret,
      hint: f.hint ?? null,
      set: Boolean(values[f.key]),
      masked: maskValue(values[f.key]),
    })),
  });
}

export async function POST(req: Request) {
  const g = await guard();
  if (!g) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const raw = body?.values && typeof body.values === "object" ? body.values : {};

  const clean: Record<string, string> = {};
  for (const f of OAUTH_CONFIG_FIELDS) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (typeof v === "string") clean[f.key] = v.trim();
  }

  try {
    const file = writeConfigValues(clean);
    // Áp ngay vào process đang chạy: route OAuth đọc process.env ở mỗi request,
    // nên không cần khởi động lại app sau khi dán Developer Token / App Secret.
    for (const [key, value] of Object.entries(clean)) {
      if (value) process.env[key] = value;
      else delete process.env[key];
    }
    return Response.json({ ok: true, configFile: file, restartRequired: false });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Lưu cấu hình thất bại" }, { status: 400 });
  }
}
