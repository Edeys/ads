"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconPlus } from "../../dashboard/icons";

type Member = {
  id: string;
  userId: string;
  role: string;
  permissions: string[];
  createdAt: string;
  email: string;
  name: string | null;
  image: string | null;
  lastSeenAt: string | null;
};

type Invite = { id: string; email: string; createdAt: string };

function initials(name: string | null, email: string) {
  const src = (name ?? email).trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function relative(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export function MembersClient({
  slug,
  currentUserId,
  canManage,
  members,
  pendingInvites,
}: {
  slug: string;
  currentUserId: string;
  canManage: boolean;
  members: Member[];
  pendingInvites: Invite[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const base = `/biz/${slug}/settings`;

  async function removeMember(id: string) {
    setBusy(true);
    await fetch(`/api/biz/${slug}/members/${id}`, { method: "DELETE" });
    setBusy(false);
    setConfirmId(null);
    router.refresh();
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">Thành viên</h1>
          <p className="ui-sub mt-1.5">
            Biz <strong style={{ color: "var(--ink-800)" }}>{slug}</strong> · {members.length} thành viên
            {pendingInvites.length > 0 ? ` · ${pendingInvites.length} lời mời chờ` : ""}
          </p>
        </div>
        {canManage && (
          <Link href={`${base}/invites`} className="ui-btn-primary" style={{ height: 36 }}>
            <IconPlus size={15} />
            Mời thành viên
          </Link>
        )}
      </div>

      <section className="ui-card overflow-hidden p-0">
        <table className="ui-table w-full">
          <thead>
            <tr>
              <th style={{ width: "34%" }}>Thành viên</th>
              <th style={{ width: "14%" }}>Vai trò</th>
              <th style={{ width: "22%" }}>Quyền</th>
              <th style={{ width: "15%" }}>Tham gia</th>
              <th style={{ width: "15%" }}>Hoạt động</th>
            </tr>
          </thead>
          <tbody>
            {members.map((mb) => {
              const isOwnerRow = mb.role === "owner";
              const onlyFullAccess = isOwnerRow;
              return (
                <tr key={mb.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      {mb.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mb.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: "var(--brand)" }}
                        >
                          {initials(mb.name, mb.email)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold" style={{ color: "var(--ink-900)" }}>
                          {mb.name ?? mb.email.split("@")[0]}
                          {mb.userId === currentUserId && (
                            <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--ink-400)" }}>
                              (bạn)
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                          {mb.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className="ui-chip"
                      style={
                        isOwnerRow
                          ? { background: "var(--ok-bg)", color: "var(--ok-ink)" }
                          : { background: "var(--brand-soft)", color: "var(--brand)" }
                      }
                    >
                      {isOwnerRow ? "Chủ Biz" : "Thành viên"}
                    </span>
                  </td>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-600)" }}>
                    {onlyFullAccess ? "Owner · toàn quyền" : `${mb.permissions.length} quyền được cấp`}
                  </td>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-600)" }}>
                    {new Date(mb.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{relative(mb.lastSeenAt)}</span>
                      {canManage && !isOwnerRow && mb.userId !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => setConfirmId(mb.id)}
                          className="text-[11.5px] font-medium"
                          style={{ color: "var(--danger-ink)" }}
                        >
                          Xoá
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {pendingInvites.length > 0 && (
        <section className="ui-card ui-card-pad mt-3">
          <h2 className="ui-h2">Lời mời đang chờ</h2>
          <ul className="mt-2 space-y-1.5">
            {pendingInvites.map((iv) => (
              <li key={iv.id} className="flex items-center justify-between text-[12.5px]">
                <span style={{ color: "var(--ink-700)" }}>{iv.email}</span>
                <span style={{ color: "var(--ink-400)" }}>gửi {new Date(iv.createdAt).toLocaleDateString("vi-VN")}</span>
              </li>
            ))}
          </ul>
          <Link href={`${base}/invites`} className="ui-btn mt-3 inline-flex">
            Quản lý lời mời
          </Link>
        </section>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmId(null)} />
          <div className="ui-card relative z-10 w-full max-w-[420px] p-5">
            <h2 className="ui-h2">Xoá thành viên?</h2>
            <p className="ui-sub mt-1">Người này sẽ mất quyền truy cập Biz ngay lập tức.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ui-btn" onClick={() => setConfirmId(null)}>
                Huỷ
              </button>
              <button
                type="button"
                className="ui-btn-primary"
                style={{ background: "var(--danger-ink)" }}
                disabled={busy}
                onClick={() => removeMember(confirmId)}
              >
                {busy ? "Đang xoá…" : "Xoá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
