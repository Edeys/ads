"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function InviteAcceptClient({
  inviteId,
  invitedEmail,
  currentEmail,
  status,
  expired,
}: {
  inviteId: string;
  invitedEmail: string;
  currentEmail: string;
  status: string;
  expired: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const wrongEmail = currentEmail !== invitedEmail;
  const alreadyHandled = status !== "pending" || expired;

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/invites/${inviteId}/accept`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          j.error === "email_mismatch"
            ? `Lời mời dành cho ${j.invitedEmail}, nhưng bạn đang đăng nhập bằng ${j.currentEmail}.`
            : j.error === "unauthorized"
              ? "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."
              : typeof j.error === "string"
                ? j.error
                : "Không chấp nhận được lời mời.",
        );
        setBusy(false);
        return;
      }
      window.location.href = `/biz/${j.slug}/dashboard`;
    } catch {
      setError("Không kết nối được tới server.");
      setBusy(false);
    }
  }

  if (alreadyHandled) {
    return (
      <div
        className="mt-5 rounded-xl px-3 py-2.5 text-[12.5px]"
        style={{ background: "var(--surface-3)", color: "var(--ink-600)" }}
      >
        {expired || status === "expired"
          ? "Lời mời này đã hết hạn."
          : status === "accepted"
            ? "Lời mời này đã được chấp nhận. Nếu bạn là thành viên, hãy mở Biz từ trang chủ."
            : status === "revoked"
              ? "Lời mời này đã bị thu hồi."
              : "Lời mời không còn hiệu lực."}
        <div className="mt-3">
          <a href="/biz" className="ui-btn">
            Về danh sách Biz
          </a>
        </div>
      </div>
    );
  }

  if (wrongEmail) {
    return (
      <div className="mt-5">
        <p
          className="rounded-xl px-3 py-2.5 text-[12.5px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger-ink)" }}
        >
          Lời mời dành cho <strong>{invitedEmail}</strong>, nhưng bạn đang đăng nhập bằng{" "}
          <strong>{currentEmail || "tài khoản khác"}</strong>. Hãy đăng xuất và đăng nhập đúng email.
        </p>
        <button
          type="button"
          className="ui-btn mt-3 w-full"
          onClick={() => signOut({ callbackUrl: `/login?callbackUrl=${encodeURIComponent(`/invites/${inviteId}`)}` })}
        >
          Đăng xuất và đổi tài khoản
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5">
      {error && (
        <p className="mb-3 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "var(--danger-bg)", color: "var(--danger-ink)" }}>
          {error}
        </p>
      )}
      <button type="button" className="ui-btn-primary w-full" onClick={accept} disabled={busy}>
        {busy ? "Đang tham gia…" : "Chấp nhận lời mời"}
      </button>
    </div>
  );
}
