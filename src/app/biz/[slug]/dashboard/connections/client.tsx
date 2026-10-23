"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { PROVIDERS, GROUP_LABELS, providerById, type ProviderDef, type ProviderGroup } from "@/lib/provider-catalog";
import { openExternal } from "@/lib/open-external";
import { StatTile } from "@/components/stat-tile";
import {
  IconBell,
  IconBook,
  IconGrid,
  IconLayers,
  IconLock,
  IconMegaphone,
  IconMore,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkle,
} from "../icons";

export type ConnRow = {
  id: string;
  provider: string;
  name: string;
  meta: Record<string, unknown>;
  health: string;
  lastCheckedAt: string | null;
  createdAt: string;
};

const HEALTH: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  ok: { label: "Hoạt động", bg: "var(--ok-bg)", color: "var(--ok-ink)", dot: "#22a55b" },
  expiring: { label: "Sắp hết hạn", bg: "var(--warn-bg)", color: "var(--warn-ink)", dot: "var(--warn-ink)" },
  dead: { label: "Lỗi / thu hồi", bg: "var(--danger-bg)", color: "var(--danger-ink)", dot: "var(--danger-ink)" },
  disabled: { label: "Đã tắt", bg: "var(--surface-3)", color: "var(--ink-500)", dot: "var(--ink-400)" },
  unchecked: { label: "Chưa kiểm tra", bg: "var(--surface-3)", color: "var(--ink-500)", dot: "var(--ink-400)" },
};

const GROUP_ICON: Record<ProviderGroup, (p: { size?: number }) => React.ReactElement> = {
  ads: IconMegaphone,
  sales: IconLayers,
  ai: IconSparkle,
  notify: IconBell,
  other: IconGrid,
};

function ago(iso: string | null) {
  if (!iso) return "chưa kiểm tra";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN");

/** Danh sách nền tảng hiển thị ở hàng chip: ưu tiên nền tảng đang có kết nối. */
function platformChips(connections: ConnRow[]) {
  const counts = new Map<string, number>();
  for (const c of connections) counts.set(c.provider, (counts.get(c.provider) ?? 0) + 1);

  const ordered = [...PROVIDERS].sort((a, b) => {
    const ca = counts.get(a.id) ?? 0;
    const cb = counts.get(b.id) ?? 0;
    if (ca !== cb) return cb - ca;
    return a.label.localeCompare(b.label, "vi");
  });
  return ordered.map((p) => ({ ...p, count: counts.get(p.id) ?? 0 }));
}

export function ConnectionsClient({
  slug,
  canManage,
  metaOAuthReady,
  tiktokOAuthReady,
  googleOAuthReady,
  isSelfHosted,
  notice,
  appUrl,
  connections,
}: {
  slug: string;
  canManage: boolean;
  metaOAuthReady: boolean;
  tiktokOAuthReady?: boolean;
  googleOAuthReady?: boolean;
  isSelfHosted?: boolean;
  notice?: { kind: "ok" | "error"; title: string; detail: string } | null;
  appUrl: string;
  connections: ConnRow[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  // Origin của app: bản desktop chạy ở 127.0.0.1:3210, đúng bằng APP_URL mà
  // redirect URI đã đăng ký ở Meta/Google. Server truyền xuống để không phụ
  // thuộc window.location (SSR render lần đầu sẽ rỗng).
  const origin = appUrl;
  const [tab, setTab] = useState<"all" | ProviderGroup>("all");
  const [platform, setPlatform] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [scopeConnId, setScopeConnId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const s: Record<ProviderGroup, number> = { ads: 0, sales: 0, ai: 0, notify: 0, other: 0 };
    for (const c of connections) {
      const g = providerById(c.provider)?.group ?? "other";
      s[g] += 1;
    }
    return s;
  }, [connections]);

  const chips = useMemo(() => platformChips(connections), [connections]);
  const comingSoon = useMemo(
    () =>
      ["bigquery", "postgresql", "ga4", "haravan", "kiotviet", "bitrix24"]
        .map((id) => PROVIDERS.find((p) => p.id === id))
        .filter(Boolean) as ProviderDef[],
    [],
  );

  const visible = connections.filter((c) => {
    const g = providerById(c.provider)?.group ?? "other";
    if (tab !== "all" && g !== tab) return false;
    if (platform !== "all" && c.provider !== platform) return false;
    if (q) {
      const hay = `${c.name} ${providerById(c.provider)?.label ?? c.provider}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const groups: ProviderGroup[] = ["ads", "sales", "ai", "notify", "other"];
  const grouped = groups
    .map((g) => ({ group: g, rows: visible.filter((c) => (providerById(c.provider)?.group ?? "other") === g) }))
    .filter((g) => g.rows.length > 0);

  async function recheck(id: string) {
    setBusy(true);
    await fetch(`/api/biz/${slug}/connections/${id}/recheck`, { method: "POST" });
    setBusy(false);
    setMenuId(null);
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Xoá kết nối "${name}"?`)) return;
    setBusy(true);
    await fetch(`/api/biz/${slug}/connections/${id}`, { method: "DELETE" });
    setBusy(false);
    setMenuId(null);
    router.refresh();
  }

  async function recheckAll() {
    setBusy(true);
    await Promise.all(connections.map((c) => fetch(`/api/biz/${slug}/connections/${c.id}/recheck`, { method: "POST" })));
    setBusy(false);
    router.refresh();
  }

  const tabs: {
    key: "all" | ProviderGroup;
    label: string;
    count: number;
    Icon: (p: { size?: number; style?: React.CSSProperties }) => React.ReactElement;
  }[] = [
    { key: "all", label: "Tất cả", count: connections.length, Icon: IconGrid },
    { key: "ads", label: GROUP_LABELS.ads, count: stats.ads, Icon: IconMegaphone },
    { key: "sales", label: GROUP_LABELS.sales, count: stats.sales, Icon: IconBook },
    { key: "ai", label: GROUP_LABELS.ai, count: stats.ai, Icon: IconSparkle },
    { key: "notify", label: GROUP_LABELS.notify, count: stats.notify, Icon: IconBell },
    { key: "other", label: GROUP_LABELS.other, count: stats.other, Icon: IconGrid },
  ];

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">Kết nối</h1>
          <p className="ui-sub mt-2 max-w-[720px]">
            Tài khoản quảng cáo, kênh bán hàng, Google Sheets, Telegram và AI mà hệ thống được phép dùng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="ui-btn" style={{ height: 38 }} onClick={recheckAll} disabled={busy}>
            <IconRefresh size={15} />
            Làm mới
          </button>
          {canManage && (
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger className="ui-btn-primary" style={{ height: 38 }}>
                <IconPlus size={15} />
                Thêm kết nối
              </Dialog.Trigger>
              <AddConnectionDialog
                slug={slug}
                metaOAuthReady={metaOAuthReady}
                tiktokOAuthReady={Boolean(tiktokOAuthReady)}
                googleOAuthReady={Boolean(googleOAuthReady)}
                isSelfHosted={Boolean(isSelfHosted)}
                onDone={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </Dialog.Root>
          )}
        </div>
      </div>

      {notice && (
        <div
          className="mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3"
          style={{
            borderColor: notice.kind === "ok" ? "var(--ok-ink)" : "var(--danger-ink)",
            background: notice.kind === "ok" ? "var(--ok-bg)" : "var(--danger-bg)",
          }}
        >
          <span
            className="mt-0.5 text-[13px] font-bold"
            style={{ color: notice.kind === "ok" ? "var(--ok-ink)" : "var(--danger-ink)" }}
          >
            {notice.kind === "ok" ? "✓" : "!"}
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
              {notice.title}
            </span>
            <span className="block text-[12.5px]" style={{ color: "var(--ink-600)" }}>
              {notice.detail}
            </span>
          </span>
        </div>
      )}

      {/* Thẻ số liệu */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Tổng cộng", value: connections.length, Icon: IconLayers },
          { label: "Quảng cáo", value: stats.ads, Icon: IconMegaphone },
          { label: "Bán hàng", value: stats.sales, Icon: IconGrid },
          { label: "AI", value: stats.ai, Icon: IconSparkle },
          { label: "Thông báo", value: stats.notify, Icon: IconBell },
          { label: "Khác", value: stats.other, Icon: IconGrid },
        ].map((s) => (
          <StatTile key={s.label} label={s.label} value={s.value} Icon={s.Icon} />
        ))}
      </div>

      {/* Sắp ra mắt — gom thành một dòng nhỏ, không chiếm diện tích màn hình */}
      {comingSoon.length > 0 && (
        <p className="mt-3 text-[12px]" style={{ color: "var(--ink-400)" }}>
          Đang phát triển:{" "}
          {comingSoon.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? " · " : ""}
              {p.label}
            </span>
          ))}
        </p>
      )}

      {/* Bảng kết nối */}
      <section className="ui-card mt-4 overflow-hidden p-0">
        <div className="ui-scroll-x flex flex-nowrap items-center gap-2 overflow-x-auto px-3 py-3">
          <div className="flex flex-nowrap shrink-0 items-center gap-1 rounded-[10px] p-1" style={{ background: "var(--surface-3)" }}>
            {tabs.map((t) => {
              const on = tab === t.key;
              const TabIcon = t.Icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors"
                  style={
                    on
                      ? { background: "var(--card)", color: "var(--ink-900)", boxShadow: "0 1px 2px rgba(13,27,42,.08)" }
                      : { color: "var(--ink-500)" }
                  }
                >
                  <TabIcon size={13} style={{ color: on ? "var(--brand)" : "var(--ink-400)" }} />
                  {t.label}
                  <span
                    className="rounded-full px-1.5 text-[10.5px] font-semibold"
                    style={on ? { background: "var(--brand-soft)", color: "var(--brand)" } : { background: "var(--surface-2)", color: "var(--ink-500)" }}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Platform chips */}
          <button
            type="button"
            onClick={() => setPlatform("all")}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors"
            style={
              platform === "all"
                ? { background: "var(--brand-soft)", color: "var(--brand)", borderColor: "var(--brand)" }
                : { background: "var(--card)", color: "var(--ink-600)", borderColor: "var(--line)" }
            }
          >
            Tất cả <span style={{ opacity: 0.65 }}>{connections.length}</span>
          </button>
          {chips.map((p) => {
            const on = platform === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(on ? "all" : p.id)}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors"
                style={
                  on
                    ? { background: "var(--brand-soft)", color: "var(--brand)", borderColor: "var(--brand)" }
                    : { background: "var(--card)", color: "var(--ink-600)", borderColor: "var(--line)" }
                }
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ background: on ? "var(--card)" : "var(--surface-3)", color: on ? "var(--brand)" : "var(--ink-500)" }}
                >
                  {p.label.slice(0, 1).toUpperCase()}
                </span>
                {p.label} <span style={{ opacity: 0.65 }}>{p.count}</span>
              </button>
            );
          })}

          <label className="relative ml-auto block w-[220px] shrink-0">
            <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-400)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm kết nối"
              className="h-8 w-full rounded-[10px] border bg-[var(--card)] pl-9 pr-3 text-[13px] outline-none focus:ring-2"
              style={{ borderColor: "var(--line)" }}
            />
          </label>
        </div>

        <table className="ui-table w-full">
          <thead>
            <tr>
              <th>Tên</th>
              <th style={{ width: 150 }}>Trạng thái</th>
              <th style={{ width: 170 }}>Quyền</th>
              <th style={{ width: 150 }}>Đang dùng bởi</th>
              <th style={{ width: 190 }}>Kiểm tra / dùng gần nhất</th>
              <th style={{ width: 64 }} className="text-right">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[13px]" style={{ color: "var(--ink-400)" }}>
                  Chưa có kết nối nào khớp bộ lọc. Bấm “Thêm kết nối” để bắt đầu.
                </td>
              </tr>
            )}

            {grouped.map(({ group, rows }) => {
              const GroupIcon = GROUP_ICON[group];
              return (
                <Fragment key={group}>
                  <tr>
                    <td colSpan={6} style={{ background: "var(--surface-2)", padding: "10px 14px" }}>
                      <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--ink-700)" }}>
                        <GroupIcon size={16} />
                        {GROUP_LABELS[group]}
                        <span
                          className="rounded-full px-1.5 text-[11px] font-semibold"
                          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                        >
                          {rows.length}
                        </span>
                      </span>
                    </td>
                  </tr>
                  {rows.map((c) => (
                    <ConnRowView
                      key={c.id}
                      conn={c}
                      canManage={canManage}
                      busy={busy}
                      menuOpen={menuId === c.id}
                      onMenu={() => setMenuId(menuId === c.id ? null : c.id)}
                      onRecheck={() => recheck(c.id)}
                      onDelete={() => remove(c.id, c.name)}
                      onScopes={() => {
                        setMenuId(null);
                        setScopeConnId(c.id);
                      }}
                    />
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>

      {scopeConnId && (
        <ScopeDialog
          slug={slug}
          connectionId={scopeConnId}
          connection={connections.find((c) => c.id === scopeConnId)}
          onClose={() => setScopeConnId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </main>
  );
}

const SCOPE_PROVIDERS = new Set(["meta_ads", "google_ads", "tiktok_ads", "google_sheets"]);

const DIAG_PROVIDER: Record<string, string> = {
  meta_ads: "meta",
  google_ads: "google",
  tiktok_ads: "tiktok",
};

/**
 * Checklist cấu hình nhà cung cấp: những gì đang thiếu khiến OAuth lỗi
 * (Business Portfolio của Meta, Developer Token của Google Ads, redirect URI).
 */
function ScopeDiagnostics({
  slug,
  provider,
  connectionId,
}: {
  slug: string;
  provider: string;
  connectionId: string;
}) {
  const [data, setData] = useState<{ checks: { ok: boolean; label: string; detail: string }[] } | null>(null);

  useEffect(() => {
    const p = DIAG_PROVIDER[provider];
    if (!p) return;
    fetch(`/api/biz/${slug}/connections/diagnose?provider=${p}&connectionId=${connectionId}`)
      .then((r) => r.json())
      .then((j) => j.checks && setData(j))
      .catch(() => {});
  }, [slug, provider, connectionId]);

  if (!data) return null;

  return (
    <section className="mt-6">
      <h3 className="ui-h2 text-[15px]">Kiểm tra cấu hình</h3>
      <ul className="mt-2 space-y-1.5">
        {data.checks.map((c) => (
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
              <span className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
                {c.label}
              </span>
              <span className="block text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                {c.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type ScopeRow = {
  scope: string;
  key: string;
  label: string;
  description: string;
  group: string;
  needsReview: boolean;
  granted: boolean;
};

type ScopeInfo = {
  supported: boolean;
  granted: string[];
  missing: string[];
  scopes: ScopeRow[];
};

/** Quyền chưa thể cấp: cần App Review, hoặc cần app Meta gắn Business Portfolio. */
function scopeBlocked(s: ScopeRow): boolean {
  return s.needsReview || s.key === "business_management";
}

/**
 * Modal quyền & tài khoản: cho người dùng thấy chính xác quyền nào đã cấp,
 * quyền nào còn thiếu, quyền nào cần Meta App Review, và nút cấp thêm quyền.
 * Danh sách tài khoản quảng cáo lấy được từ provider hiển thị ngay tại đây.
 */
function ScopeDialog({
  slug,
  connectionId,
  connection,
  onClose,
  onChanged,
}: {
  slug: string;
  connectionId: string;
  connection?: ConnRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [info, setInfo] = useState<ScopeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/biz/${slug}/connections/${connectionId}/scopes`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) setError("Không đọc được trạng thái quyền.");
        else {
          setInfo(j);
          setPicked(
            (j.missing ?? []).filter((k: string) => {
              const s = j.scopes?.find((x: ScopeRow) => x.key === k);
              return s ? !scopeBlocked(s) : false;
            }),
          );
        }
      })
      .catch(() => alive && setError("Không đọc được trạng thái quyền."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slug, connectionId]);

  async function grant() {
    const keys = picked.filter((k) => {
      const s = info?.scopes.find((x) => x.key === k);
      return s ? !scopeBlocked(s) : false;
    });
    if (!keys.length) return;
    setBusy(true);
    const res = await fetch(`/api/biz/${slug}/connections/${connectionId}/scopes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keys }),
    }).then((r) => r.json());
    setBusy(false);
    if (res.url) {
      window.location.href = res.url;
    } else {
      setError(res.error ?? "Không mở được trang cấp quyền.");
    }
  }

  const meta = (connection?.meta ?? {}) as Record<string, unknown>;
  const adAccounts = (meta.adAccounts as Record<string, unknown>[]) ?? [];
  const customers = (meta.customers as Record<string, unknown>[]) ?? [];
  const advertisers = (meta.advertisers as Record<string, unknown>[]) ?? [];
  const pages = (meta.pages as Record<string, unknown>[]) ?? [];
  const pixels = (meta.pixels as Record<string, unknown>[]) ?? [];

  const accountRows = adAccounts.length
    ? adAccounts.map((a) => ({ id: String(a.id ?? ""), name: String(a.name ?? ""), extra: String(a.currency ?? "") }))
    : customers.length
      ? customers.map((c) => ({ id: String(c.id ?? ""), name: String(c.descriptiveName ?? ""), extra: String(c.currencyCode ?? "") }))
      : advertisers.map((a) => ({
          id: String(a.advertiser_id ?? ""),
          name: String(a.advertiser_name ?? ""),
          extra: String(a.currency ?? ""),
        }));

  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(860px,94vw)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-[var(--card)] p-6">
          <Dialog.Title className="ui-h2">Quyền &amp; tài khoản — {connection?.name}</Dialog.Title>
          <Dialog.Description className="ui-sub mt-1">
            Quyền đã cấp cho kết nối này. Thiếu quyền thì các tính năng tương ứng sẽ không chạy.
          </Dialog.Description>

          {error && (
            <p className="mt-3 rounded-xl px-3 py-2 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger-ink)" }}>
              {error}
            </p>
          )}

          {loading ? (
            <p className="mt-6 text-[13px]" style={{ color: "var(--ink-400)" }}>
              Đang tải trạng thái quyền…
            </p>
          ) : (
            info?.supported ? (
              <>
                <div className="mt-4 flex items-center gap-2 text-[13px]">
                  <span
                    className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                    style={{ background: "var(--ok-bg)", color: "var(--ok-ink)" }}
                  >
                    {info.granted.length} quyền đã cấp
                  </span>
                  {info.missing.length > 0 && (
                    <span
                      className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                      style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
                    >
                      thiếu {info.missing.length}
                    </span>
                  )}
                </div>

                <div className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
                  {info.scopes.map((s) => {
                    const blocked = scopeBlocked(s) && !s.granted;
                    return (
                      <label key={s.key} className="flex cursor-pointer items-start gap-3 py-2.5">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={s.granted || picked.includes(s.key)}
                          disabled={s.granted || blocked}
                          onChange={(e) =>
                            setPicked((prev) =>
                              e.target.checked ? [...prev, s.key] : prev.filter((k) => k !== s.key),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
                              {s.label}
                            </span>
                            {s.granted && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: "var(--ok-bg)", color: "var(--ok-ink)" }}
                              >
                                Đã cấp
                              </span>
                            )}
                            {blocked && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: "var(--surface-3)", color: "var(--ink-500)" }}
                              >
                                {s.needsReview ? "Cần duyệt App" : "Cần Business Portfolio"}
                              </span>
                            )}
                          </span>
                          <span className="block text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                            {s.description}
                          </span>
                          <code className="mt-0.5 block text-[11px]" style={{ color: "var(--ink-400)" }}>
                            {s.scope}
                          </code>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                    Các quyền còn lại cấp ngay. Quyền “Cần duyệt App” chỉ bật được sau khi Meta duyệt ứng dụng;
                    “Cần Business Portfolio” chỉ bật được sau khi app Meta được gắn vào Business Portfolio.
                  </p>
                  <button
                    type="button"
                    className="ui-btn-primary"
                    disabled={busy || !picked.length}
                    onClick={grant}
                    style={{ height: 38, opacity: busy || !picked.length ? 0.6 : 1 }}
                  >
                    {busy ? "Đang mở…" : "Cấp quyền đã chọn"}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-5 text-[13px]" style={{ color: "var(--ink-500)" }}>
                Kết nối này không dùng cơ chế cấp quyền OAuth nên không có danh sách quyền.
              </p>
            )
          )}

          {connection && (
            <ScopeDiagnostics slug={slug} provider={connection.provider} connectionId={connection.id} />
          )}

          {accountRows.length > 0 && (
            <section className="mt-6">
              <h3 className="ui-h2 text-[15px]">Tài khoản quảng cáo ({accountRows.length})</h3>
              <table className="ui-table mt-2">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tên</th>
                    <th>Tiền tệ</th>
                  </tr>
                </thead>
                <tbody>
                  {accountRows.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: "ui-monospace, monospace" }}>{a.id}</td>
                      <td>{a.name}</td>
                      <td>{a.extra || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {pages.length > 0 && (
            <section className="mt-5">
              <h3 className="ui-h2 text-[15px]">Fanpage ({pages.length})</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {pages.map((pg) => (
                  <li
                    key={String(pg.id)}
                    className="rounded-full px-2.5 py-1 text-[12px]"
                    style={{ background: "var(--surface-3)", color: "var(--ink-600)" }}
                  >
                    {String(pg.name ?? pg.id)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pixels.length > 0 && (
            <section className="mt-5">
              <h3 className="ui-h2 text-[15px]">Pixel ({pixels.length})</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {pixels.map((px) => (
                  <li
                    key={String(px.id)}
                    className="rounded-full px-2.5 py-1 text-[12px]"
                    style={{ background: "var(--surface-3)", color: "var(--ink-600)" }}
                  >
                    {String(px.name ?? px.id)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {meta.hasDeveloperToken === false && connection?.provider === "google_ads" && (
            <p className="mt-5 rounded-xl px-3 py-2 text-[12.5px]" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}>
              Chưa có Google Ads Developer Token nên hệ thống không đọc được tài khoản quảng cáo.
              Thêm token ở Cài đặt → Ứng dụng OAuth rồi kết nối lại.
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <button type="button" className="ui-btn" onClick={onClose} style={{ height: 38 }}>
              Đóng
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConnRowView({
  conn: c,
  canManage,
  busy,
  menuOpen,
  onMenu,
  onRecheck,
  onDelete,
  onScopes,
}: {
  conn: ConnRow;
  canManage: boolean;
  busy: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onRecheck: () => void;
  onDelete: () => void;
  onScopes: () => void;
}) {
  const p = providerById(c.provider);
  const h = HEALTH[c.health] ?? HEALTH.unchecked;
  const adAccounts = ((c.meta?.adAccounts as Record<string, unknown>[]) ?? []) as Record<string, unknown>[];
  const advertisers = ((c.meta?.advertisers as Record<string, unknown>[]) ?? []) as Record<string, unknown>[];
  const pages = ((c.meta?.pages as Record<string, unknown>[]) ?? []) as Record<string, unknown>[];
  const customers = ((c.meta?.customers as Record<string, unknown>[]) ?? []) as Record<string, unknown>[];

  const accountName =
    (adAccounts[0]?.name as string | undefined) ??
    (advertisers[0]?.advertiser_name as string | undefined) ??
    (customers[0]?.descriptiveName as string | undefined) ??
    (typeof c.meta?.bot_username === "string" ? `@${c.meta.bot_username}` : undefined);
  const accountId =
    (adAccounts[0]?.id as string | undefined) ??
    (advertisers[0]?.advertiser_id as string | undefined) ??
    (customers[0]?.id as string | undefined) ??
    undefined;
  const pageNames = pages.map((pg) => String(pg.name ?? "")).filter(Boolean);

  // Số tài khoản quảng cáo đã lấy được từ provider.
  const accountCount = adAccounts.length || advertisers.length || customers.length;
  const grantedCount = ((c.meta?.grantedScopes as string[]) ?? []).length;
  const missingCount = ((c.meta?.missingScopes as string[]) ?? []).length;
  const tokenExpiresAt = typeof c.meta?.tokenExpiresAt === "string" ? new Date(c.meta.tokenExpiresAt as string) : null;
  const tokenDaysLeft =
    tokenExpiresAt && Number.isFinite(tokenExpiresAt.getTime())
      ? Math.ceil((tokenExpiresAt.getTime() - Date.now()) / 86_400_000)
      : null;

  return (
    <tr>
      <td>
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            {(p?.label ?? c.provider).slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
              {c.name}
            </div>
            <div className="truncate text-[12.5px]" style={{ color: "var(--ink-500)" }}>
              {p?.label ?? c.provider}
              {accountName ? ` · ${accountName}` : ""}
              {accountId ? ` · ${accountId}` : ""}
            </div>
            {accountCount > 1 && (
              <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--ink-400)" }}>
                {accountCount} tài khoản quảng cáo
              </div>
            )}
            {pageNames.length > 0 && (
              <div className="mt-0.5 flex items-center gap-1 truncate text-[12px]" style={{ color: "var(--ink-400)" }}>
                <IconLock size={12} />
                {pageNames.length} trang: {pageNames.slice(0, 2).join(", ")}
                {pageNames.length > 2 ? "…" : ""}
              </div>
            )}
          </div>
        </div>
      </td>

      <td>
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold"
          style={{ background: h.bg, color: h.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: h.dot }} />
          {h.label}
        </span>
        {tokenDaysLeft !== null && (
          <div
            className="mt-1 text-[11px]"
            style={{ color: tokenDaysLeft <= 7 ? "var(--danger-ink)" : "var(--ink-400)" }}
            title={tokenExpiresAt?.toLocaleString("vi-VN")}
          >
            Token còn {Math.max(0, tokenDaysLeft)} ngày
          </div>
        )}
      </td>

      <td>
        {SCOPE_PROVIDERS.has(c.provider) ? (
          <button
            type="button"
            onClick={onScopes}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors"
            style={
              missingCount > 0
                ? { background: "var(--warn-bg)", color: "var(--warn-ink)" }
                : { background: "var(--ok-bg)", color: "var(--ok-ink)" }
            }
          >
            <IconLock size={12} />
            {grantedCount} quyền
            {missingCount > 0 ? ` · thiếu ${missingCount}` : ""}
          </button>
        ) : (
          <span className="text-[13px]" style={{ color: "var(--ink-300)" }}>
            —
          </span>
        )}
      </td>

      <td className="text-[13px]" style={{ color: "var(--ink-500)" }}>
        {typeof c.meta?.usedBy === "string" ? (c.meta.usedBy as string) : "—"}
      </td>

      <td>
        <div className="text-[13px]" style={{ color: "var(--ink-600)" }}>
          {ago(c.lastCheckedAt)}
        </div>
        <div className="text-[12px]" style={{ color: "var(--ink-400)" }}>
          Tạo {fmtDate(c.createdAt)}
        </div>
      </td>

      <td className="text-right">
        {canManage ? (
          <span className="relative inline-block">
            <button
              type="button"
              aria-label="Thao tác"
              onClick={onMenu}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-3)]"
              style={{ color: "var(--ink-400)" }}
            >
              <IconMore size={18} />
            </button>
            {menuOpen && (
              <>
                <span className="fixed inset-0 z-10" onClick={onMenu} />
                <span
                  className="absolute right-0 top-9 z-20 w-[150px] overflow-hidden rounded-xl border bg-[var(--card)] py-1 text-left"
                  style={{ borderColor: "var(--line)", boxShadow: "0 12px 28px -12px rgba(13,27,42,.28)" }}
                >
                  <button
                    type="button"
                    onClick={onRecheck}
                    disabled={busy}
                    className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)] disabled:opacity-50"
                    style={{ color: "var(--ink-700)" }}
                  >
                    Kiểm tra ngay
                  </button>
                  {SCOPE_PROVIDERS.has(c.provider) && (
                    <button
                      type="button"
                      onClick={onScopes}
                      disabled={busy}
                      className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)] disabled:opacity-50"
                      style={{ color: "var(--ink-700)" }}
                    >
                      Quyền &amp; tài khoản
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={busy}
                    className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--danger-bg)] disabled:opacity-50"
                    style={{ color: "var(--danger-ink)" }}
                  >
                    Xoá kết nối
                  </button>
                </span>
              </>
            )}
          </span>
        ) : (
          <span className="text-[13px]" style={{ color: "var(--ink-300)" }}>
            —
          </span>
        )}
      </td>
    </tr>
  );
}

const OAUTH_CONNECT: Record<string, { path: string; label: string; provider?: string }> = {
  meta_ads: { path: "meta", label: "Facebook" },
  tiktok_ads: { path: "tiktok", label: "TikTok Ads" },
  google_ads: { path: "google", label: "Google Ads", provider: "google_ads" },
  google_search_console: { path: "google", label: "Google", provider: "search_console" },
  ga4: { path: "google", label: "Google", provider: "ga4" },
};

function AddConnectionDialog({
  slug,
  metaOAuthReady,
  tiktokOAuthReady,
  googleOAuthReady,
  isSelfHosted,
  onDone,
}: {
  slug: string;
  metaOAuthReady: boolean;
  tiktokOAuthReady: boolean;
  googleOAuthReady: boolean;
  isSelfHosted: boolean;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<ProviderDef | null>(null);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const oauth = picked ? OAUTH_CONNECT[picked.id] : undefined;
  const oauthReady =
    picked?.id === "meta_ads"
      ? metaOAuthReady
      : picked?.id === "tiktok_ads"
        ? tiktokOAuthReady
        : picked?.id === "google_ads" || picked?.id === "google_search_console" || picked?.id === "ga4"
          ? googleOAuthReady
          : false;
  const showManualForm = !oauthReady || manualOpen;

  const groups: ProviderGroup[] = ["ads", "sales", "ai", "notify", "other"];

  async function submit() {
    if (!picked) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/biz/${slug}/connections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: picked.id, name: name || picked.label, values }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.message ?? j.error ?? "Lỗi không xác định");
      return;
    }
    onDone();
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-[var(--card)] p-6 shadow-xl">
        <Dialog.Title className="mb-4 text-[18px] font-bold" style={{ color: "var(--ink-900)" }}>
          Thêm kết nối
        </Dialog.Title>

        {!picked ? (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
                  {GROUP_LABELS[g]}
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {PROVIDERS.filter((p) => p.group === g).map((p) => (
                    <button
                      key={p.id}
                      disabled={p.comingSoon}
                      onClick={() => {
                        setPicked(p);
                        setName("");
                        setValues({});
                        setError("");
                        setManualOpen(false);
                      }}
                      className="rounded-xl border p-3 text-left text-[13px] transition-colors hover:border-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ borderColor: "var(--line)" }}
                    >
                      {p.label}
                      {p.comingSoon && (
                        <div className="text-[11px]" style={{ color: "var(--ink-400)" }}>
                          Sắp ra mắt
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <button
              onClick={() => {
                setPicked(null);
                setManualOpen(false);
                setError("");
              }}
              className="mb-3 text-[13px] font-medium"
              style={{ color: "var(--brand)" }}
            >
              ← Chọn lại
            </button>
            <div className="mb-3 text-[14px] font-semibold" style={{ color: "var(--ink-800)" }}>
              {picked.label}
            </div>
            {picked.hint && (
              <p className="mb-3 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                {picked.hint}
              </p>
            )}

            {oauth && oauthReady && (
              <div className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
                <p className="mb-2.5 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                  Không cần tạo access token. Bấm nút bên dưới, đăng nhập {oauth.label} trong trình duyệt và đồng ý quyền.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    openExternal(
                      `${origin}/api/connect/${oauth.path}/start?slug=${slug}${
                        oauth.provider ? `&provider=${oauth.provider}` : ""
                      }`,
                    )
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-center text-[13px] font-semibold"
                  style={{ borderColor: "var(--brand)", background: "var(--brand-soft)", color: "var(--brand)" }}
                >
                  Kết nối với {oauth.label} →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualOpen((v) => !v);
                    setError("");
                  }}
                  className="mt-2 w-full text-center text-[11.5px] underline"
                  style={{ color: "var(--ink-400)" }}
                >
                  {manualOpen ? "Ẩn nhập token thủ công" : "Không kết nối được? Nhập token thủ công"}
                </button>
                {!manualOpen && (
                  <p className="mt-2 text-[11px]" style={{ color: "var(--ink-400)" }}>
                    Nút kết nối chỉ xin bộ quyền cơ bản. Có thể cấp thêm quyền sau khi kết nối, trong mục “Quyền &amp; tài khoản”.
                  </p>
                )}
              </div>
            )}

            {showManualForm && (
              <>
            <label className="mb-3 block">
              <span className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                Tên hiển thị
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={picked.label}
                className="w-full rounded-xl border px-3 py-2 text-[13px]"
                style={{ borderColor: "var(--line-strong)" }}
              />
            </label>

            {picked.fields.map((f) => (
              <label key={f.key} className="mb-3 block">
                <span className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {f.label}
                  {f.required && " *"}
                </span>
                {f.textarea ? (
                  <textarea
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    rows={5}
                    className="w-full rounded-xl border px-3 py-2 font-mono text-[12px]"
                    style={{ borderColor: "var(--line-strong)" }}
                  />
                ) : (
                  <input
                    type={f.secret ? "password" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full rounded-xl border px-3 py-2 text-[13px]"
                    style={{ borderColor: "var(--line-strong)" }}
                  />
                )}
              </label>
            ))}
              </>
            )}

            {error && (
              <div className="mb-3 rounded-xl px-3 py-2 text-[12.5px]" style={{ background: "var(--danger-bg)", color: "var(--danger-ink)" }}>
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Dialog.Close className="ui-btn">Huỷ</Dialog.Close>
              {showManualForm && (
                <button onClick={submit} disabled={saving} className="ui-btn-primary">
                  {saving ? "Đang lưu…" : "Lưu kết nối"}
                </button>
              )}
            </div>
          </div>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
