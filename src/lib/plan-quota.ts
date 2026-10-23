// Hạn mức gói cước: đếm tài nguyên hiện có và kiểm tra trước khi thêm mới.
//
// Quota được lưu trong bảng plans (snapshot lúc mua) và fallback về bảng giá
// tĩnh nếu Biz chưa có bản ghi plan. Đây là "chặn mềm": API trả 409 kèm số liệu
// để UI hiển thị thông báo nâng cấp, không âm thầm cắt dữ liệu.
import { db, schema } from "@/db";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { PRICING, type PlanTier } from "./pricing";

export type Quota = { tkqc: number; qlbh: number; staff: number; minSyncMinutes: number };

/**
 * Bản self-hosted/desktop mặc định KHÔNG chặn theo quota gói cước — đây là app
 * của chủ máy, không phải SaaS. Chỉ bật khi triển khai multi-tenant:
 *   ADSYNC_ENFORCE_QUOTAS=1
 */
export function quotasEnforced(): boolean {
  return process.env.ADSYNC_ENFORCE_QUOTAS === "1";
}

/** Quota hiển thị khi không bật chặn — coi như không giới hạn. */
export const UNLIMITED_QUOTA: Quota = { tkqc: 999, qlbh: 999, staff: 999, minSyncMinutes: 1 };

export const ADS_PROVIDERS = ["meta_ads", "tiktok_ads", "google_ads", "openai_ads"] as const;
export const SALES_PROVIDERS = ["pancake_pos", "pancake_crm", "pancake_chat", "nhanhvn", "sapo", "shopify", "woocommerce"] as const;

export async function getBizPlan(bizId: string): Promise<{
  tier: PlanTier;
  quota: Quota;
  status: string;
  expiresAt: Date | null;
}> {
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.bizId, bizId))
    .orderBy(desc(schema.plans.startedAt))
    .limit(1);
  const tier = PRICING.find((p) => p.tier === (plan?.tier ?? "trial")) ?? PRICING[0];
  return {
    tier,
    quota: quotasEnforced() ? (plan?.quota as Quota) ?? tier.quota : UNLIMITED_QUOTA,
    status: plan?.status ?? "active",
    expiresAt: plan?.expiresAt ?? null,
  };
}

/** Đếm số tài khoản quảng cáo đã kết nối (Meta adAccounts, Google customers, TikTok advertisers). */
export async function countAdAccounts(bizId: string): Promise<number> {
  const conns = await db
    .select({ provider: schema.connections.provider, meta: schema.connections.meta })
    .from(schema.connections)
    .where(and(eq(schema.connections.bizId, bizId), inArray(schema.connections.provider, [...ADS_PROVIDERS])));

  let count = 0;
  for (const c of conns) {
    const meta = (c.meta ?? {}) as Record<string, unknown>;
    const lists = ["adAccounts", "customers", "advertisers"].map((k) => meta[k]).filter(Array.isArray) as unknown[][];
    const n = lists.reduce((a, list) => a + list.length, 0);
    count += n > 0 ? n : 1; // kết nối đã tạo nhưng chưa đọc được danh sách vẫn tính 1
  }
  return count;
}

export async function countSalesConnections(bizId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.connections.id })
    .from(schema.connections)
    .where(and(eq(schema.connections.bizId, bizId), inArray(schema.connections.provider, [...SALES_PROVIDERS])));
  return rows.length;
}

export async function countStaff(bizId: string): Promise<{ members: number; invites: number; total: number }> {
  const members = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(eq(schema.members.bizId, bizId));
  const invites = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.bizId, bizId),
        eq(schema.invites.status, "pending"),
        or(isNull(schema.invites.expiresAt), gt(schema.invites.expiresAt, new Date())),
      ),
    );
  return { members: members.length, invites: invites.length, total: members.length + invites.length };
}

export function quotaError(kind: "tkqc" | "qlbh" | "staff", current: number, adding: number, quota: number) {
  const label = kind === "tkqc" ? "tài khoản quảng cáo" : kind === "qlbh" ? "kết nối bán hàng" : "thành viên";
  return Response.json(
    {
      error: `quota_${kind}`,
      message: `Gói hiện tại cho phép ${quota} ${label}. Bạn đang có ${current}${adding ? `, thêm ${adding} sẽ vượt hạn mức` : ""}. Nâng cấp gói để tiếp tục.`,
      current,
      adding,
      quota,
    },
    { status: 409 },
  );
}
