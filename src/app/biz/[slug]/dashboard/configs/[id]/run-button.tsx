"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Chạy ngay" trong app local = chạy thử (mock), KHÔNG gọi nền tảng quảng cáo thật.
 * Mọi thao tác ghi lên tài khoản thật phải đi qua Approval Gate.
 */
export function RunConfigButton({ slug, id, disabled }: { slug: string; id: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/biz/${slug}/configs/${id}/run`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setMsg(body.error === "config_off" ? "Cấu hình đang tắt." : "Không chạy được.");
      } else {
        setMsg(body.mocked ? "Đã chạy thử (mock) — không gửi lệnh lên nền tảng." : "Đã chạy.");
        router.refresh();
      }
    } catch {
      setMsg("Mất kết nối tới server local.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={run} disabled={busy || disabled} className="ui-btn-primary disabled:opacity-50">
        {busy ? "Đang chạy…" : "Chạy ngay"}
      </button>
      {msg && (
        <span className="text-[12px]" style={{ color: "var(--ink-500)" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
