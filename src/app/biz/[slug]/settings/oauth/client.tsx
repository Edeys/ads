"use client";

import { useState } from "react";
import { openExternal } from "@/lib/open-external";

type TestCheck = { ok: boolean; label: string; detail: string };
type TestLink = { label: string; href: string };
type TestResult = {
  provider: string;
  checks: TestCheck[];
  links: TestLink[];
  appName?: string | null;
  roles?: { user: string; role: string }[];
};

type Field = {
  key: string;
  label: string;
  provider: string;
  secret: boolean;
  hint: string | null;
  set: boolean;
  masked: string;
};

type Provider = {
  id: string;
  label: string;
  redirectUri: string;
  appId: string | null;
};

function quickLinks(p: Provider): TestLink[] {
  if (p.id === "meta") {
    const base = p.appId ? `https://developers.facebook.com/apps/${p.appId}` : "https://developers.facebook.com/apps/";
    return [
      { label: "App Dashboard", href: p.appId ? `${base}/dashboard/` : base },
      { label: "Facebook Login", href: p.appId ? `${base}/fb-login/settings/` : base },
      { label: "Roles / Testers", href: p.appId ? `${base}/roles/` : base },
      { label: "App Review", href: p.appId ? `${base}/app-review/` : base },
      { label: "Business Settings", href: "https://business.facebook.com/settings/apps" },
    ];
  }
  if (p.id === "google") {
    return [
      { label: "Google Ads API Center", href: "https://ads.google.com/manager/api/" },
      { label: "OAuth consent screen", href: "https://console.cloud.google.com/apis/credentials/consent" },
      { label: "OAuth credentials", href: "https://console.cloud.google.com/apis/credentials" },
    ];
  }
  return [{ label: "TikTok Developer Portal", href: "https://business-api.tiktok.com/portal/app" }];
}

const PROVIDER_TINT: Record<string, { bg: string; color: string; border: string }> = {
  meta: { bg: "var(--brand-soft)", color: "var(--brand)", border: "var(--line)" },
  tiktok: { bg: "var(--ink-900)", color: "var(--card)", border: "var(--ink-900)" },
  google: { bg: "var(--danger-bg)", color: "var(--danger-ink)", border: "var(--danger-ink)" },
};

export function OAuthConfigClient({
  appUrl,
  configFile,
  canWrite,
  providers,
  fields,
}: {
  appUrl: string;
  configFile: string | null;
  canWrite: boolean;
  providers: Provider[];
  fields: Field[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult | null>>({});
  const [testing, setTesting] = useState<string | null>(null);

  async function runTest(provider: string) {
    setTesting(provider);
    try {
      const res = await fetch(`/api/self-hosted/oauth-config/test?provider=${provider}`);
      const j = await res.json().catch(() => ({}));
      setTests((t) => ({
        ...t,
        [provider]: res.ok ? (j as TestResult) : { provider, checks: [{ ok: false, label: "Không kiểm tra được", detail: j.error ?? `HTTP ${res.status}` }], links: [] },
      }));
    } catch (e: any) {
      setTests((t) => ({
        ...t,
        [provider]: { provider, checks: [{ ok: false, label: "Lỗi mạng", detail: e?.message ?? "Không gọi được server." }], links: [] },
      }));
    } finally {
      setTesting(null);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/self-hosted/oauth-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: j.error ?? "Lưu thất bại" });
        return;
      }
      setValues({});
      setMsg({
        ok: true,
        text: `Đã lưu vào ${j.configFile} và áp dụng ngay cho server đang chạy.`,
      });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? "Lỗi mạng" });
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4">
        <h1 className="ui-h1">Ứng dụng OAuth</h1>
        <p className="ui-sub mt-1.5 max-w-[760px]">
          Đăng ký ứng dụng của bạn ở Meta / TikTok / Google rồi điền App ID và Secret vào đây. Khi đó nút
          “Kết nối nhanh” trong màn <b>Kết nối</b> sẽ kéo tài khoản quảng cáo và Pages về tự động.
        </p>
      </div>

      <section className="ui-card ui-card-pad">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            {providers.filter((p) => fields.some((f) => f.provider === p.id && f.set)).length}/{providers.length} nền tảng đã cấu hình
          </span>
          <span className="text-[12.5px]" style={{ color: "var(--ink-500)" }}>
            Địa chỉ gốc của app: <code className="rounded bg-[var(--surface-3)] px-1">{appUrl}</code>
          </span>
        </div>
      </section>

      {providers.map((p) => {
        const pf = fields.filter((f) => f.provider === p.id);
        const tint = PROVIDER_TINT[p.id] ?? { bg: "var(--brand-soft)", color: "var(--brand)", border: "var(--line)" };
        return (
          <section key={p.id} className="ui-card ui-card-pad mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-7 items-center rounded-lg px-2 text-[12px] font-bold"
                  style={{ background: tint.bg, color: tint.color }}
                >
                  {p.label}
                </span>
                <span className="text-[13px]" style={{ color: "var(--ink-500)" }}>
                  {pf.filter((f) => f.set).length > 0 ? "Đã có cấu hình" : "Chưa cấu hình"}
                </span>
              </div>
              <button
                type="button"
                className="ui-btn-primary"
                style={{ height: 32 }}
                onClick={() => runTest(p.id)}
                disabled={testing === p.id}
              >
                {testing === p.id ? "Đang kiểm tra…" : "Kiểm tra trực tiếp"}
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {quickLinks(p).map((l) => (
                <button
                  key={l.href + l.label}
                  type="button"
                  className="ui-btn"
                  style={{ height: 30, fontSize: 12 }}
                  onClick={() => openExternal(l.href)}
                >
                  {l.label} ↗
                </button>
              ))}
            </div>

            {tests[p.id] && (
              <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                <div className="mb-2 text-[12px] font-semibold" style={{ color: "var(--ink-700)" }}>
                  Kết quả kiểm tra trực tiếp
                  {tests[p.id]?.appName ? ` · ${tests[p.id]?.appName}` : ""}
                </div>
                <ul className="space-y-1.5">
                  {tests[p.id]?.checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={
                          c.ok
                            ? { background: "var(--ok-bg)", color: "var(--ok-ink)" }
                            : { background: "var(--warn-bg)", color: "var(--warn-ink)" }
                        }
                      >
                        {c.ok ? "✓" : "!"}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold" style={{ color: "var(--ink-700)" }}>
                          {c.label}
                        </span>
                        <span className="block text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                          {c.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--surface-3)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--ink-600)" }}>
                Redirect URI cần đăng ký ở {p.label}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-[12px]"
                  style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink-700)" }}
                >
                  {p.redirectUri}
                </code>
                <button type="button" className="ui-btn" onClick={() => copy(p.redirectUri, p.id)}>
                  {copied === p.id ? "Đã copy" : "Copy"}
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {pf.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                    {f.label}
                    {f.set && (
                      <span className="ml-2 text-[11.5px] font-normal" style={{ color: "var(--ok-ink)" }}>
                        đang dùng {f.masked}
                      </span>
                    )}
                  </span>
                  <input
                    type={f.secret ? "password" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    placeholder={f.set ? f.masked : "chưa cấu hình"}
                    className="h-10 w-full rounded-xl border bg-[var(--card)] px-3 text-[13px] outline-none focus:ring-2"
                    style={{ borderColor: "var(--line-strong)" }}
                  />
                  {f.hint && (
                    <span className="mt-1 block text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                      {f.hint}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </section>
        );
      })}

      <section className="ui-card ui-card-pad mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
              Lưu cấu hình
            </div>
            <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
              {canWrite
                ? `Ghi vào ${configFile} và áp dụng ngay cho server đang chạy.`
                : "Bản web không ghi được file cấu hình — đặt biến trong .env.local rồi khởi động lại server."}
            </div>
          </div>
          <button type="button" className="ui-btn-primary" onClick={save} disabled={busy || !canWrite}>
            {busy ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>

        {msg && (
          <div
            className="mt-3 rounded-xl px-3 py-2 text-[12.5px]"
            style={{
              background: msg.ok ? "var(--ok-bg)" : "var(--danger-bg)",
              color: msg.ok ? "var(--ok-ink)" : "var(--danger-ink)",
            }}
          >
            {msg.text}
          </div>
        )}
      </section>
    </main>
  );
}
