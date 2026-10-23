"use client";

import { useEffect, useState } from "react";
import { invokeTauri, isDesktopShell } from "@/lib/open-external";
import { IconSparkle } from "../dashboard/icons";

interface UpdateInfo {
  version: string;
  notes?: string;
  date?: string;
}

export function DesktopUpdateSection() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setIsDesktop(isDesktopShell());
  }, []);

  if (!isDesktop) return null;

  async function handleCheck() {
    setChecking(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = (await invokeTauri("check_update")) as UpdateInfo | null;
      if (res) {
        setUpdateInfo(res);
        setStatusMsg(`Đã tìm thấy phiên bản mới: v${res.version}`);
      } else {
        setUpdateInfo(null);
        setStatusMsg("Bạn đang dùng phiên bản mới nhất (v0.2.0).");
      }
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Lỗi kiểm tra bản cập nhật");
    } finally {
      setChecking(false);
    }
  }

  async function handleInstall() {
    setInstalling(true);
    setErrorMsg(null);
    try {
      setStatusMsg("Đang tải và cập nhật ứng dụng, sau đó app sẽ tự khởi động lại...");
      await invokeTauri("install_update");
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Lỗi cài đặt bản cập nhật");
      setInstalling(false);
    }
  }

  return (
    <section className="ui-card ui-card-pad mt-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="ui-h2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
              <IconSparkle size={14} />
            </span>
            Cập nhật AdsSync Desktop
          </h2>
          <p className="ui-sub mt-1">
            Ứng dụng chạy trên máy cục bộ (Tauri 2). Phiên bản hiện tại:{" "}
            <code className="rounded bg-[var(--surface-3)] px-1 font-mono text-[13px]">v0.2.0</code>.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCheck}
          disabled={checking || installing}
          className="ui-btn shrink-0"
        >
          {checking ? "Đang kiểm tra..." : "Kiểm tra cập nhật"}
        </button>
      </div>

      {statusMsg && (
        <div className="mt-3 rounded-lg bg-[var(--surface-3)] p-3 text-[13px] text-[var(--ink-700)]">
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mt-3 rounded-lg bg-[var(--bad-bg)] p-3 text-[13px] text-[var(--bad-ink)]">
          {errorMsg}
        </div>
      )}

      {updateInfo && (
        <div className="mt-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand-soft)]/20 p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--ink-900)]">
              Phiên bản mới: v{updateInfo.version}
            </span>
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="ui-btn-primary"
            >
              {installing ? "Đang cài đặt..." : "Cài đặt & Khởi động lại"}
            </button>
          </div>
          {updateInfo.notes && (
            <div className="mt-2 text-[12.5px] text-[var(--ink-600)] whitespace-pre-wrap">
              {updateInfo.notes}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
