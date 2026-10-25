"use client";

import { useEffect, useRef, useState } from "react";
import { invokeTauri } from "@/lib/open-external";

type Provider = "google" | "openai";

const LABEL: Record<Provider, string> = { google: "Google", openai: "ChatGPT" };

export function LoginClient({
  callbackUrl = "/biz",
  chatGptEnabled = false,
}: {
  callbackUrl?: string;
  chatGptEnabled?: boolean;
}) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIsDesktop(Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__));
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function desktopLogin(provider: Provider) {
    setBusy(true);
    setStatus(`Đang mở trình duyệt hệ thống…`);
    try {
      const res = await fetch(`/api/desktop/auth-bridge?provider=${provider}`, { method: "POST" });
      if (!res.ok) throw new Error(`bridge ${res.status}`);
      const { code, url } = await res.json();

      await invokeTauri("open_external", { url });
      setStatus(`Đang chờ bạn đăng nhập ${LABEL[provider]} trong trình duyệt…`);

      timer.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/desktop/auth-bridge/status?code=${code}`);
          const j = await r.json();
          if (j.ok) {
            if (timer.current) clearInterval(timer.current);
            setStatus("Đăng nhập thành công, đang vào workspace…");
            // Cookie phiên đã được set cho webview -> sang thẳng workspace
            // (reload lại trang /login sẽ vẫn hiện form đăng nhập).
            window.location.href = callbackUrl;
          }
        } catch {
          /* im lặng, thử lại ở vòng sau */
        }
      }, 1500);
    } catch (e: any) {
      setBusy(false);
      setStatus(`Không mở được trình duyệt: ${e?.message ?? e}`);
    }
  }

  // NextAuth v5 chỉ nhận POST /api/auth/signin/:provider kèm CSRF — thẻ <a>
  // GET sẽ bị từ chối với lỗi Configuration. Tự lấy CSRF rồi submit form POST.
  async function webLogin(p: Provider) {
    setBusy(true);
    setStatus(`Đang chuyển tới ${LABEL[p]}…`);
    try {
      const c = await (await fetch("/api/auth/csrf", { credentials: "include" })).json();
      const f = document.createElement("form");
      f.method = "POST";
      f.action = `/api/auth/signin/${p}`;
      const i1 = Object.assign(document.createElement("input"), { name: "csrfToken", value: c.csrfToken });
      const i2 = Object.assign(document.createElement("input"), { name: "callbackUrl", value: callbackUrl });
      f.append(i1, i2);
      document.body.appendChild(f);
      f.submit();
    } catch (e: any) {
      setBusy(false);
      setStatus(`Không bắt đầu được đăng nhập: ${e?.message ?? e}`);
    }
  }

  const providers: Provider[] = chatGptEnabled ? ["google", "openai"] : ["google"];

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-80 rounded-xl border bg-[var(--card)] p-10 text-center shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">AdsSync Local</h1>
        <p className="mb-6 text-sm text-zinc-500">Đăng nhập để quản lý Biz của bạn</p>

        {isDesktop ? (
          <div>
            {providers.map((p) => (
              <button
                key={p}
                onClick={() => desktopLogin(p)}
                disabled={busy}
                className="mb-2 w-full rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Đang xử lý…" : `Đăng nhập với ${LABEL[p]}`}
              </button>
            ))}
            {status && <p className="mt-3 text-xs text-zinc-500">{status}</p>}
            <p className="mt-4 text-[11.5px] leading-relaxed text-zinc-400">
              Trình duyệt hệ thống sẽ mở để đăng nhập. Xong bạn quay lại cửa sổ này.
            </p>
          </div>
        ) : (
          <div>
            {providers.map((p) => (
              <button
                key={p}
                onClick={() => webLogin(p)}
                disabled={busy}
                className="mb-2 w-full rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Đang xử lý…" : `Đăng nhập với ${LABEL[p]}`}
              </button>
            ))}
            {status && <p className="mt-3 text-xs text-zinc-500">{status}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
