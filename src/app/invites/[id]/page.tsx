// Trang chấp nhận lời mời tham gia Biz.
//
// Người được mời đăng nhập bằng đúng email trong lời mời, xem quyền sẽ được cấp
// rồi bấm chấp nhận. Trang này nằm ngoài dashboard vì người dùng chưa là thành viên.
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { PERMISSION_DOCS } from "@/lib/permissions";
import type { Permission } from "@/db/schema";
import { InviteAcceptClient } from "./client";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invite] = await db.select().from(schema.invites).where(eq(schema.invites.id, id)).limit(1);
  if (!invite) notFound();

  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.id, invite.bizId)).limit(1);
  if (!biz) notFound();

  const session = await auth();
  const currentEmail = session?.user?.email?.trim().toLowerCase() ?? "";
  const invitedEmail = invite.email.trim().toLowerCase();
  const expired = Boolean(invite.expiresAt && invite.expiresAt.getTime() < Date.now());

  // Chưa đăng nhập -> quay lại đúng trang này sau khi đăng nhập.
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invites/${id}`)}`);
  }

  const permissions = (invite.permissions ?? []) as Permission[];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[520px]">
        <div className="ui-card p-6">
          <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
            Lời mời tham gia Biz
          </div>
          <h1 className="ui-h1 mt-1">{biz.name}</h1>
          <p className="ui-sub mt-1.5">
            {invite.email} được mời vào Biz <strong style={{ color: "var(--ink-700)" }}>{biz.slug}</strong>.
          </p>

          <div className="mt-4">
            <div className="text-[12px] font-semibold" style={{ color: "var(--ink-600)" }}>
              Quyền sẽ được cấp ({permissions.length})
            </div>
            <ul className="mt-2 space-y-1.5">
              {permissions.length === 0 ? (
                <li className="text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  Chỉ quyền xem cơ bản.
                </li>
              ) : (
                permissions.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--ink-700)" }}>
                    <span style={{ color: "var(--ok-ink)" }}>✓</span>
                    <span>
                      <strong>{PERMISSION_DOCS[p]?.label ?? p}</strong>
                      {PERMISSION_DOCS[p]?.desc ? (
                        <span className="block text-[11px]" style={{ color: "var(--ink-400)" }}>
                          {PERMISSION_DOCS[p].desc}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          {invite.expiresAt && (
            <p className="mt-4 text-[11.5px]" style={{ color: expired ? "var(--danger-ink)" : "var(--ink-400)" }}>
              {expired
                ? `Lời mời đã hết hạn ngày ${invite.expiresAt.toLocaleDateString("vi-VN")}.`
                : `Lời mời hết hạn ngày ${invite.expiresAt.toLocaleDateString("vi-VN")}.`}
            </p>
          )}

          <InviteAcceptClient
            inviteId={invite.id}
            invitedEmail={invitedEmail}
            currentEmail={currentEmail}
            status={invite.status}
            expired={expired}
          />
        </div>

        <p className="mt-3 text-center text-[11.5px]" style={{ color: "var(--ink-400)" }}>
          Bạn đang đăng nhập bằng {currentEmail || "tài khoản chưa xác định"}.
        </p>
      </div>
    </main>
  );
}
