// Meta connect bước 3 — xác nhận chọn tài khoản ("create-from-pending").
//
// Nhận pending_id từ bước token + danh sách ad account / page người dùng chọn.
// Kiểm lại quota TỪI LUÚC LƯU (số liệu có thể đổi giữa 2 bước), rồi
// saveOAuthConnection: meta chứa đúng tài khoản đã chọn, giữ nguyên shape
// (adAccounts/pages/grantedScopes/missingScopes) để tools & UI đọc như cũ.
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { saveOAuthConnection } from "@/lib/connection-store";
import { countAdAccounts, getBizPlan, quotasEnforced } from "@/lib/plan-quota";
import { deletePendingConnect, getPendingConnect } from "@/lib/connect-pending";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug ?? "");
  const m = slug ? await getMembership(slug) : null;
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const pending = getPendingConnect(String(body.pending_id ?? ""));
  if (!pending || pending.bizId !== m.biz.id) {
    return Response.json({ error: "Phiên chọn tài khoản đã hết hạn (10 phút). Kết nối lại nhé." }, { status: 410 });
  }

  const accountIds = new Set((Array.isArray(body.account_ids) ? body.account_ids : []).map(String));
  const pageIds = new Set((Array.isArray(body.page_ids) ? body.page_ids : []).map(String));
  const selectedAccounts = pending.adAccounts.filter((a) => accountIds.has(a.id));
  const selectedPages = pending.pages.filter((p) => pageIds.has(p.id));

  if (!selectedAccounts.length) {
    return Response.json({ error: "Chọn ít nhất một tài khoản quảng cáo." }, { status: 400 });
  }

  if (quotasEnforced()) {
    const { quota } = await getBizPlan(m.biz.id);
    const used = await countAdAccounts(m.biz.id);
    // Nếu đang cập nhật connection cũ thì số account cũ của nó được thay thế,
    // không cộng chồng.
    const replacing = pending.existingId
      ? (((await db.select().from(schema.connections).where(eq(schema.connections.id, pending.existingId)).limit(1))[0]?.meta as any)?.adAccounts ?? [])
      : [];
    const effectiveUsed = used - (replacing as { id: string }[]).length;
    if (effectiveUsed + selectedAccounts.length > quota.tkqc) {
      return Response.json(
        {
          error: `Gói hiện tại cho phép ${quota.tkqc} tài khoản quảng cáo; đang dùng ${effectiveUsed}, chọn ${selectedAccounts.length} sẽ vượt hạn mức. Bỏ chọn bớt hoặc nâng cấp gói.`,
        },
        { status: 400 },
      );
    }
  }

  const meta = {
    ...(pending.meta as Record<string, unknown>),
    adAccounts: selectedAccounts,
    pages: selectedPages,
  };

  const { row, updated } = await saveOAuthConnection({
    bizId: m.biz.id,
    existingId: pending.existingId,
    provider: "meta_ads",
    name: String(body.name ?? pending.name ?? "Meta Ads"),
    secret: pending.secret,
    meta,
  });

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: updated ? "connection.update" : "connection.create",
    objectType: "connection",
    objectId: row.id,
    detail: {
      provider: "meta_ads",
      via: String(pending.secret.access_token).startsWith("mock_") ? "oauth_sandbox" : "oauth_popup",
      accountsCount: selectedAccounts.length,
      pagesCount: selectedPages.length,
    },
  });

  deletePendingConnect(pending.id);

  return Response.json({ ok: true, id: row.id, updated, accounts: selectedAccounts.length, pages: selectedPages.length });
}

