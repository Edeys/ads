"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { PERMISSIONS, SENSITIVE_PERMISSIONS, type Permission } from "@/db/schema";
import { PERMISSION_DOCS } from "@/lib/permissions";


export type BizData = {
  id: string;
  slug: string;
  name: string;
  isPersonal: boolean;
  vatTaxCode: string | null;
  vatCompanyName: string | null;
  vatCompanyAddress: string | null;
  createdAt: string;
};

export type MemberRow = {
  id: string;
  userId: string;
  role: string;
  permissions: Permission[];
  createdAt: string;
  userEmail: string;
  userName: string | null;
  userImage: string | null;
};

export type InviteRow = {
  id: string;
  email: string;
  permissions: Permission[];
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

const inputCls = "w-full rounded-md border px-3 py-2 text-sm";
const labelCls = "mb-3 block text-sm";
const labelTitleCls = "mb-1 block text-zinc-600 font-medium";

export function SettingsClient({
  slug,
  isOwner,
  canManage,
  currentUserId,
  biz,
  members,
  invites,
}: {
  slug: string;
  isOwner: boolean;
  canManage: boolean;
  currentUserId: string;
  biz: BizData;
  members: MemberRow[];
  invites: InviteRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"general" | "members" | "invites" | "roles">("general");

  // State for Biz General info
  const [bizName, setBizName] = useState(biz.name);
  const [taxCode, setTaxCode] = useState(biz.vatTaxCode ?? "");
  const [companyName, setCompanyName] = useState(biz.vatCompanyName ?? "");
  const [companyAddress, setCompanyAddress] = useState(biz.vatCompanyAddress ?? "");
  const [bizSaving, setBizSaving] = useState(false);
  const [bizMessage, setBizMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Modals state
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);
  const [memberPerms, setMemberPerms] = useState<Set<Permission>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerms, setInvitePerms] = useState<Set<Permission>>(new Set());
  const [inviteError, setInviteError] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSaveBiz(e: React.FormEvent) {
    e.preventDefault();
    setBizSaving(true);
    setBizMessage(null);
    try {
      const res = await fetch(`/api/biz/${slug}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: bizName,
          vatTaxCode: taxCode,
          vatCompanyName: companyName,
          vatCompanyAddress: companyAddress,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBizMessage({ type: "err", text: err.error ?? "Lỗi khi lưu thông tin" });
      } else {
        setBizMessage({ type: "ok", text: "Đã cập nhật thông tin thành công!" });
        router.refresh();
      }
    } catch {
      setBizMessage({ type: "err", text: "Lỗi kết nối máy chủ" });
    } finally {
      setBizSaving(false);
    }
  }

  async function handleUpdateMemberPerms() {
    if (!editingMember) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/biz/${slug}/members/${editingMember.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissions: Array.from(memberPerms) }),
      });
      if (res.ok) {
        setEditingMember(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(m: MemberRow) {
    if (!confirm(`Xoá thành viên "${m.userName || m.userEmail}" khỏi Biz?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/biz/${slug}/members/${m.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteSaving(true);
    setInviteError("");
    try {
      const res = await fetch(`/api/biz/${slug}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          permissions: Array.from(invitePerms),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setInviteError(err.error ?? "Lỗi khi gửi lời mời");
      } else {
        setInviteOpen(false);
        setInviteEmail("");
        setInvitePerms(new Set());
        router.refresh();
      }
    } finally {
      setInviteSaving(false);
    }
  }

  async function handleRevokeInvite(id: string) {
    if (!confirm("Thu hồi lời mời này?")) return;
    setBusy(true);
    try {
      await fetch(`/api/biz/${slug}/invites/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="ui-h1">Cài đặt Biz & Đội ngũ</h1>
          <p className="ui-sub mt-1">Quản lý thông tin doanh nghiệp, thành viên và phân quyền truy cập</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b">
        <button
          onClick={() => setTab("general")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "general" ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Thông tin Biz
        </button>
        <button
          onClick={() => setTab("members")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "members" ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Thành viên ({members.length})
        </button>
        <button
          onClick={() => setTab("invites")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "invites" ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Lời mời ({invites.length})
        </button>
        <button
          onClick={() => setTab("roles")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "roles" ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Vai trò & Quyền (15)
        </button>
      </div>

      {/* Tab: Thông tin Biz */}
      {tab === "general" && (
        <div className="max-w-2xl rounded-xl border bg-[var(--card)] p-6 shadow-sm">
          <form onSubmit={handleSaveBiz}>
            <div className="mb-4">
              <label className={labelCls}>
                <span className={labelTitleCls}>Tên Biz / Tổ chức *</span>
                <input
                  className={inputCls}
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  disabled={!canManage}
                  required
                />
              </label>
              <div className="text-xs text-zinc-500">
                Đường dẫn Biz: <code className="rounded bg-zinc-100 px-1 py-0.5">/biz/{biz.slug}</code>
              </div>
            </div>

            <div className="mb-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
              <span className="font-semibold">Loại tài khoản:</span>{" "}
              {biz.isPersonal ? "Biz cá nhân (Mặc định)" : "Tổ chức Doanh nghiệp"}
              {biz.isPersonal && (
                <div className="mt-1 text-zinc-500">
                  Biz cá nhân gắn liền với tài khoản của bạn và không thể chuyển nhượng hoặc xoá riêng lẻ.
                </div>
              )}
            </div>

            <hr className="my-5" />
            <h3 className="mb-3 text-sm font-semibold">Thông tin xuất hoá đơn VAT (Tuỳ chọn)</h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                <span className={labelTitleCls}>Mã số thuế (MST)</span>
                <input
                  className={inputCls}
                  placeholder="VD: 0101234567"
                  value={taxCode}
                  onChange={(e) => setTaxCode(e.target.value)}
                  disabled={!canManage}
                />
              </label>

              <label className={labelCls}>
                <span className={labelTitleCls}>Tên công ty</span>
                <input
                  className={inputCls}
                  placeholder="Công ty TNHH ..."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={!canManage}
                />
              </label>

              <label className={`${labelCls} sm:col-span-2`}>
                <span className={labelTitleCls}>Địa chỉ công ty</span>
                <input
                  className={inputCls}
                  placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  disabled={!canManage}
                />
              </label>
            </div>

            {bizMessage && (
              <div
                className={`mb-4 rounded-md p-3 text-sm ${
                  bizMessage.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
              >
                {bizMessage.text}
              </div>
            )}

            {canManage && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={bizSaving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {bizSaving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Tab: Thành viên */}
      {tab === "members" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm text-zinc-500">Danh sách các tài khoản có quyền truy cập vào Biz này</div>
            {canManage && (
              <button
                onClick={() => setInviteOpen(true)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                + Mời thành viên
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border bg-[var(--card)] shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Thành viên</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">Quyền hạn</th>
                  <th className="px-4 py-3">Ngày tham gia</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((m) => {
                  const isCurOwner = m.role === "owner";
                  const isSelf = m.userId === currentUserId;
                  return (
                    <tr key={m.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700 text-xs">
                            {m.userName ? m.userName.charAt(0).toUpperCase() : m.userEmail.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-zinc-900">{m.userName || "Chưa đặt tên"}</div>
                            {isSelf && <span className="text-[10px] text-blue-600">(Bạn)</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{m.userEmail}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            isCurOwner ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {isCurOwner ? "Chủ Biz" : "Thành viên"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isCurOwner ? (
                          <span className="text-xs text-zinc-500 font-medium">Toàn quyền hệ thống</span>
                        ) : (
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            {m.permissions?.length ?? 0} quyền
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {new Date(m.createdAt).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && !isCurOwner && (
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              disabled={busy}
                              onClick={() => {
                                setEditingMember(m);
                                setMemberPerms(new Set(m.permissions || []));
                              }}
                              className="text-blue-600 hover:underline"
                            >
                              Sửa quyền
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => handleRemoveMember(m)}
                              className="text-red-600 hover:underline"
                            >
                              Xoá
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Lời mời */}
      {tab === "invites" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm text-zinc-500">Danh sách các lời mời đã gửi và trạng thái xử lý</div>
            {canManage && (
              <button
                onClick={() => setInviteOpen(true)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                + Gửi lời mời mới
              </button>
            )}
          </div>

          {invites.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-[var(--card)] p-10 text-center text-sm text-zinc-500">
              Chưa có lời mời nào. Bấm "+ Gửi lời mời mới" để mời cộng tác viên.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-[var(--card)] shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Email nhận</th>
                    <th className="px-4 py-3">Quyền cấp</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Hạn lời mời</th>
                    <th className="px-4 py-3">Ngày gửi</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invites.map((inv) => (
                    <tr key={inv.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900">{inv.email}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                          {inv.permissions?.length ?? 0} quyền
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            inv.status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : inv.status === "accepted"
                              ? "bg-green-100 text-green-800"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {inv.status === "pending" ? "Chờ chấp nhận" : inv.status === "accepted" ? "Đã tham gia" : inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString("vi-VN") : "Không hạn"}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {new Date(inv.createdAt).toLocaleDateString("vi-VN")}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {canManage && inv.status === "pending" && (
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => {
                                const link = `${window.location.origin}/invites/${inv.id}`;
                                navigator.clipboard.writeText(link);
                                alert("Đã sao chép link tham gia!");
                              }}
                              className="text-blue-600 hover:underline"
                            >
                              Copy link
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="text-red-600 hover:underline"
                            >
                              Thu hồi
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Vai trò & Quyền */}
      {tab === "roles" && (
        <div className="rounded-xl border bg-[var(--card)] p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Ma trận 15 quyền hệ thống</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Chủ Biz (Owner) có toàn quyền thao tác. Thành viên chỉ có các quyền được chỉ định cụ thể.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PERMISSIONS.map((perm) => {
              const info = PERMISSION_DOCS[perm];
              return (
                <div key={perm} className="rounded-lg border p-3 hover:border-blue-400">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-zinc-900">{info.label}</span>
                    {info.sensitive && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        NHẠY CẢM
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{info.desc}</div>
                  <code className="mt-2 block text-[11px] text-zinc-400">{perm}</code>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialog Sửa quyền thành viên */}
      {editingMember && (
        <Dialog.Root open={true} onOpenChange={(open) => !open && setEditingMember(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(650px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-[var(--card)] p-6 shadow-xl">
              <Dialog.Title className="mb-1 text-lg font-semibold">
                Sửa quyền cho {editingMember.userName || editingMember.userEmail}
              </Dialog.Title>
              <Dialog.Description className="mb-4 text-xs text-zinc-500">
                Chọn các quyền mà thành viên này được phép thực hiện trong Biz.
              </Dialog.Description>

              <div className="mb-4 flex items-center justify-between border-b pb-2">
                <span className="text-xs font-semibold text-zinc-600">Đã chọn: {memberPerms.size}/15 quyền</span>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setMemberPerms(new Set(PERMISSIONS))}
                    className="text-blue-600 hover:underline"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setMemberPerms(new Set())}
                    className="text-zinc-500 hover:underline"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {PERMISSIONS.map((p) => {
                  const doc = PERMISSION_DOCS[p];
                  const checked = memberPerms.has(p);
                  return (
                    <label
                      key={p}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                        checked ? "border-blue-500 bg-blue-50/50" : "hover:bg-zinc-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const s = new Set(memberPerms);
                          if (e.target.checked) s.add(p);
                          else s.delete(p);
                          setMemberPerms(s);
                        }}
                        className="mt-0.5 rounded border-zinc-300"
                      />
                      <div>
                        <div className="font-medium text-zinc-900 flex items-center gap-1">
                          {doc.label}
                          {doc.sensitive && (
                            <span className="text-[9px] font-bold text-red-600">[Nhạy cảm]</span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500">{doc.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="rounded-md border px-4 py-2 text-sm"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleUpdateMemberPerms}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? "Đang lưu..." : "Lưu quyền"}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* Dialog Mời thành viên mới */}
      <Dialog.Root open={inviteOpen} onOpenChange={setInviteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(650px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-[var(--card)] p-6 shadow-xl">
            <Dialog.Title className="mb-1 text-lg font-semibold">Mời thành viên mới vào Biz</Dialog.Title>
            <Dialog.Description className="mb-4 text-xs text-zinc-500">
              Nhập email người cần mời và chọn các quyền truy cập được cấp.
            </Dialog.Description>

            <form onSubmit={handleCreateInvite}>
              <label className={labelCls}>
                <span className={labelTitleCls}>Email người nhận *</span>
                <input
                  type="email"
                  className={inputCls}
                  placeholder="name@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </label>

              <div className="mb-3 flex items-center justify-between border-b pb-2">
                <span className="text-xs font-semibold text-zinc-600">Phân quyền ({invitePerms.size}/15)</span>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setInvitePerms(new Set(PERMISSIONS))}
                    className="text-blue-600 hover:underline"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvitePerms(new Set())}
                    className="text-zinc-500 hover:underline"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              <div className="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {PERMISSIONS.map((p) => {
                  const doc = PERMISSION_DOCS[p];
                  const checked = invitePerms.has(p);
                  return (
                    <label
                      key={p}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${
                        checked ? "border-blue-500 bg-blue-50/50" : "hover:bg-zinc-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const s = new Set(invitePerms);
                          if (e.target.checked) s.add(p);
                          else s.delete(p);
                          setInvitePerms(s);
                        }}
                        className="mt-0.5 rounded border-zinc-300"
                      />
                      <div>
                        <div className="font-medium text-zinc-900">{doc.label}</div>
                        <div className="text-[10px] text-zinc-500">{doc.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {inviteError && (
                <div className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">{inviteError}</div>
              )}

              <div className="mt-5 flex justify-end gap-2 border-t pt-4">
                <Dialog.Close className="rounded-md border px-4 py-2 text-sm">Huỷ</Dialog.Close>
                <button
                  type="submit"
                  disabled={inviteSaving || !inviteEmail}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {inviteSaving ? "Đang gửi..." : "Tạo lời mời"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

