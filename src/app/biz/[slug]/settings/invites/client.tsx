"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "../../dashboard/icons";
import { PERMISSION_DOCS } from "@/lib/permissions";
import type { Permission } from "@/db/schema";

type Invite = {
  id: string;
  email: string;
  permissions: string[];
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

const STATUS: Record<string, { label: string; style: React.CSSProperties }> = {
  pending: { label: "Chờ chấp nhận", style: { background: "var(--warn-bg)", color: "var(--warn-ink)" } },
  accepted: { label: "Đã tham gia", style: { background: "var(--ok-bg)", color: "var(--ok-ink)" } },
  revoked: { label: "Đã thu hồi", style: { background: "var(--surface-3)", color: "var(--ink-500)" } },
  expired: { label: "Hết hạn", style: { background: "var(--danger-bg)", color: "var(--danger-ink)" } },
};

const ALL_PERMISSIONS = Object.keys(PERMISSION_DOCS) as Permission[];
const inputCls = "w-full rounded-xl border px-3 py-2 text-[13.5px] outline-none focus:ring-2";

export function InvitesClient({
  slug,
  invites,
  existingEmails,
}: {
  slug: string;
  invites: Invite[];
  existingEmails: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(invites.length === 0);
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Permission[]>(["ad_metrics.access", "metric_sync.access"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const pending = invites.filter((i) => i.status === "pending");

  async function submit() {
    setError("");
    setCreated(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      setError("Email không hợp lệ.");
      return;
    }
    if (existingEmails.map((e) => e.toLowerCase()).includes(mail)) {
      setError("Email này đã là thành viên hoặc đang có lời mời chờ.");
      return;
    }
    if (selected.length === 0) {
      setError("Chọn ít nhất một quyền cho người được mời.");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/biz/${slug}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: mail, permissions: selected }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(
        j.error === "already_member"
          ? "Email này đã là thành viên."
          : j.error === "quota_staff"
            ? j.message ?? "Gói hiện tại đã đạt giới hạn thành viên."
            : "Không tạo được lời mời.",
      );
      return;
    }
    setCreated(j.inviteUrl ?? `${window.location.origin}/invites/${j.id}`);
    setEmail("");
    router.refresh();
  }

  async function revoke(id: string) {
    setBusy(true);
    await fetch(`/api/biz/${slug}/invites/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  async function copyInviteLink(id: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invites/${id}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1800);
    } catch {
      setError("Trình duyệt không cho phép sao chép. Hãy mở link /invites/" + id + " thủ công.");
    }
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">Lời mời</h1>
          <p className="ui-sub mt-1.5">
            Mời người khác vào Biz và chọn đúng quyền họ cần. {pending.length} lời mời đang chờ.
          </p>
        </div>
        <button type="button" className="ui-btn-primary" style={{ height: 36 }} onClick={() => setOpen((v) => !v)}>
          <IconPlus size={15} />
          Mời thành viên
        </button>
      </div>

      {open && (
        <section className="ui-card ui-card-pad mb-3">
          <h2 className="ui-h2">Mời thành viên mới</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.4fr]">
            <label className="block">
              <span className="ui-label mb-1 block">Email</span>
              <input
                className={inputCls}
                style={{ borderColor: "var(--line-strong)" }}
                placeholder="ten@congty.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="mt-2 block text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                Lời mời hết hạn sau 7 ngày. Người được mời đăng nhập bằng đúng email này.
              </span>
            </label>

            <div>
              <span className="ui-label mb-1 block">Quyền được cấp ({selected.length})</span>
              <div className="ui-scroll max-h-[190px] overflow-y-auto rounded-xl border p-2" style={{ borderColor: "var(--line-strong)" }}>
                {ALL_PERMISSIONS.map((p) => {
                  const doc = PERMISSION_DOCS[p];
                  const on = selected.includes(p);
                  return (
                    <label
                      key={p}
                      className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-[var(--surface-3)]"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={on}
                        onChange={() =>
                          setSelected((prev) => (on ? prev.filter((x) => x !== p) : [...prev, p]))
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-medium" style={{ color: "var(--ink-800)" }}>
                          {doc.label}
                        </span>
                        <span className="block text-[11px]" style={{ color: "var(--ink-400)" }}>
                          {doc.desc}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--danger-ink)" }}>
              {error}
            </p>
          )}
          {created && (
            <p className="mt-2 break-all rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-[12px]" style={{ color: "var(--brand)" }}>
              Đã tạo lời mời. Link chấp nhận: <code>{created}</code>
            </p>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="ui-btn" onClick={() => setOpen(false)}>
              Đóng
            </button>
            <button type="button" className="ui-btn-primary" onClick={submit} disabled={busy}>
              {busy ? "Đang gửi…" : "Gửi lời mời"}
            </button>
          </div>
        </section>
      )}

      <section className="ui-card overflow-hidden p-0">
        <table className="ui-table w-full">
          <thead>
            <tr>
              <th style={{ width: "34%" }}>Email</th>
              <th style={{ width: "18%" }}>Trạng thái</th>
              <th style={{ width: "18%" }}>Số quyền</th>
              <th style={{ width: "16%" }}>Gửi lúc</th>
              <th style={{ width: "14%" }} />
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  Chưa có lời mời nào.
                </td>
              </tr>
            ) : (
              invites.map((iv) => (
                <tr key={iv.id}>
                  <td className="text-[13px] font-medium" style={{ color: "var(--ink-800)" }}>
                    {iv.email}
                  </td>
                  <td>
                    <span className="ui-chip" style={STATUS[iv.status]?.style}>
                      {STATUS[iv.status]?.label ?? iv.status}
                    </span>
                  </td>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-600)" }}>
                    {iv.permissions.length} quyền
                  </td>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                    {new Date(iv.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="text-right">
                    {iv.status === "pending" && (
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          className="text-[12px] font-medium"
                          style={{ color: "var(--brand)" }}
                          onClick={() => copyInviteLink(iv.id)}
                        >
                          {copiedId === iv.id ? "Đã sao chép" : "Copy link"}
                        </button>
                        <button
                          type="button"
                          className="text-[12px] font-medium"
                          style={{ color: "var(--danger-ink)" }}
                          onClick={() => revoke(iv.id)}
                          disabled={busy}
                        >
                          Thu hồi
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

