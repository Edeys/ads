"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { FIXED_METRICS, META_METRICS } from "@/lib/metrics-catalog";
import { IconBolt, IconCalendar, IconChart, IconLayers, IconMegaphone, IconPlus, IconSearch } from "../icons";

export type ConfigRow = {
  id: string; type: string; name: string; provider: string;
  credentialId: string | null; intervalMinutes: number;
  params: Record<string, unknown>; status: string;
  lastRunAt: string | null; lastRunStatus: string | null; lastError: string | null;
  createdAt: string;
};
export type ConnOpt = { id: string; provider: string; name: string; meta: Record<string, unknown>; health: string };
export type ThresholdOpt = { id: string; name: string; platform: string };

const TYPES = [
  { id: "metrics_pull", label: "Kéo chỉ số", desc: "Facebook · TikTok → Google Sheets" },
  { id: "auto_pause", label: "Ads Autopilot", desc: "Tự tắt theo ngưỡng CPA" },
  { id: "budget_schedule", label: "Tăng giảm ngân sách", desc: "Theo khung giờ trong ngày" },
  { id: "post_trigger", label: "Tự động chạy ads", desc: "Bài mới khớp keyword → tạo campaign" },
] as const;

const PROVIDER_LABEL: Record<string, string> = { facebook: "Facebook", tiktok: "TikTok", google: "Google Ads", openai: "OpenAI Ads" };
// type nội bộ → ?filter= trên URL (đúng tên tham số của Done.vn)
const TYPE_TO_FILTER: Record<string, string> = {
  auto_pause: "auto-pause",
  post_trigger: "auto-run",
  budget_schedule: "budget",
  metrics_pull: "metrics",
};
const STATUS_CLS: Record<string, string> = {
  on: "bg-green-100 text-green-700", off: "bg-zinc-200 text-zinc-600", error: "bg-red-100 text-red-700",
};

/** Tiêu đề, mô tả và trạng thái rỗng khác nhau theo từng tab (giống Done.vn). */
const TYPE_META: Record<
  string,
  { title: string; subtitle: string; emptyTitle: string; emptyBody: string; cta: string; Icon: (p: { size?: number; style?: React.CSSProperties }) => React.ReactElement }
> = {
  all: {
    title: "Tất cả cấu hình",
    subtitle: "Toàn bộ cấu hình tự động của Biz: kéo chỉ số, Ads Autopilot, tăng giảm ngân sách, tự động chạy ads.",
    emptyTitle: "Chưa có cấu hình nào",
    emptyBody: "Thêm cấu hình đầu tiên để hệ thống bắt đầu chạy thay bạn.",
    cta: "Thêm cấu hình",
    Icon: IconLayers,
  },
  metrics_pull: {
    title: "Kéo chỉ số",
    subtitle: "Các cấu hình kéo số liệu quảng cáo từ Facebook, TikTok về Google Sheets hoặc webhook.",
    emptyTitle: "Chưa có lịch kéo chỉ số",
    emptyBody: "Tự động tải số liệu quảng cáo theo chu kỳ bạn chọn.",
    cta: "Tạo lịch kéo chỉ số",
    Icon: IconChart,
  },
  auto_pause: {
    title: "Ads Autopilot",
    subtitle: "Các cấu hình tự tắt quảng cáo khi vượt ngưỡng CPA và không nằm trong danh sách bảo vệ.",
    emptyTitle: "Chưa có luật Autopilot",
    emptyBody: "Đặt ngưỡng CPA, hệ thống tự tắt quảng cáo kém hiệu quả theo chu kỳ.",
    cta: "Tạo luật Autopilot",
    Icon: IconBolt,
  },
  budget_schedule: {
    title: "Tăng giảm ngân sách",
    subtitle: "Các cấu hình tự động điều chỉnh ngân sách quảng cáo theo lịch.",
    emptyTitle: "Chưa có lịch tăng giảm ngân sách",
    emptyBody: "Tự động điều chỉnh ngân sách chiến dịch theo khung giờ trong ngày.",
    cta: "Tạo lịch ngân sách",
    Icon: IconCalendar,
  },
  post_trigger: {
    title: "Tự động chạy ads",
    subtitle: "Bài đăng mới khớp từ khoá sẽ tự tạo chiến dịch quảng cáo.",
    emptyTitle: "Chưa có cấu hình tự động chạy ads",
    emptyBody: "Bài viết mới khớp từ khoá → tự tạo campaign với ngân sách đã đặt.",
    cta: "Tạo cấu hình",
    Icon: IconMegaphone,
  },
};

export function ConfigsClient({ slug, canManage, configs, connections, thresholds, initialFilter = "all" }: {
  slug: string; canManage: boolean; configs: ConfigRow[]; connections: ConnOpt[]; thresholds: ThresholdOpt[];
  initialFilter?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialFilter);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of configs) m.set(c.type, (m.get(c.type) ?? 0) + 1);
    return m;
  }, [configs]);

  const visible = (tab === "all" ? configs : configs.filter((c) => c.type === tab)).filter((c) =>
    q ? c.name.toLowerCase().includes(q.toLowerCase()) : true,
  );
  const connName = (id: string | null) => connections.find((c) => c.id === id)?.name ?? "—";
  const meta = TYPE_META[tab] ?? TYPE_META.all;
  const EmptyIcon = meta.Icon;

  async function patch(id: string, body: object) {
    setBusy(true);
    await fetch(`/api/biz/${slug}/configs/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    router.refresh();
  }
  async function remove(id: string, name: string) {
    if (!confirm(`Xoá cấu hình "${name}"?`)) return;
    setBusy(true);
    await fetch(`/api/biz/${slug}/configs/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
        <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="ui-h1">{meta.title}</h1>
          <p className="ui-sub mt-2 max-w-[660px]">{meta.subtitle}</p>
        </div>
        {canManage && (
          <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPicked(null); }}>
            <Dialog.Trigger className="ui-btn-primary shrink-0" style={{ height: 38 }}>
              <IconPlus size={15} />
              Thêm cấu hình
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(760px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-[var(--card)] p-6 shadow-xl">
                <Dialog.Title className="mb-4 text-[18px] font-bold" style={{ color: "var(--ink-900)" }}>
                  Thêm cấu hình mới
                </Dialog.Title>
                {!picked ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {TYPES.map((t) => (
                      <button key={t.id} onClick={() => setPicked(t.id)}
                        className="rounded-xl border p-4 text-left transition-colors hover:border-[var(--brand)]"
                        style={{ borderColor: "var(--line)" }}>
                        <div className="text-[13.5px] font-semibold" style={{ color: "var(--ink-900)" }}>{t.label}</div>
                        <div className="mt-1 text-[12.5px]" style={{ color: "var(--ink-500)" }}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                ) : picked === "metrics_pull" ? (
                  <MetricsPullForm slug={slug} connections={connections} onBack={() => setPicked(null)} onDone={() => { setOpen(false); router.refresh(); }} />
                ) : picked === "auto_pause" ? (
                  <AutoPauseForm slug={slug} connections={connections} thresholds={thresholds} onBack={() => setPicked(null)} onDone={() => { setOpen(false); router.refresh(); }} />
                ) : (
                  <WizardRedirect slug={slug} type={picked} onBack={() => setPicked(null)} />
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>

      <section className="ui-card mt-4 overflow-hidden p-0">
        <div className="relative flex items-center gap-2 px-3 pt-3">
          <div className="flex flex-1 items-center gap-1 overflow-hidden pr-[248px]">
            <Tab
              label="Tất cả"
              count={configs.length}
              icon={TYPE_META.all.Icon}
              active={tab === "all"}
              onClick={() => {
                setTab("all");
                router.replace(`/biz/${slug}/dashboard/configs`);
              }}
            />
            {TYPES.map((t) => (
              <Tab
                key={t.id}
                label={t.label}
                count={counts.get(t.id) ?? 0}
                icon={TYPE_META[t.id].Icon}
                active={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  const q = TYPE_TO_FILTER[t.id];
                  router.replace(`/biz/${slug}/dashboard/configs${q ? `?filter=${q}` : ""}`);
                }}
              />
            ))}
          </div>
          <label className="absolute right-3 top-3 block w-[240px]">
            <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-400)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm kiếm cấu hình"
              className="h-9 w-full rounded-xl border bg-[var(--card)] pl-9 pr-3 text-[13px] outline-none focus:ring-2"
              style={{ borderColor: "var(--line)" }}
            />
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border"
              style={{ borderColor: "var(--line)", background: "var(--surface-3)", color: "var(--brand)" }}
            >
              <EmptyIcon size={24} />
            </span>
            <p className="mt-3 text-[16px] font-bold" style={{ color: "var(--ink-900)" }}>
              {meta.emptyTitle}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-500)" }}>
              {meta.emptyBody}
            </p>
            {canManage && (
              <button type="button" onClick={() => setOpen(true)} className="ui-btn-primary mt-3.5" style={{ height: 38 }}>
                <IconPlus size={15} />
                {meta.cta}
              </button>
            )}
          </div>
        ) : (
          <table className="ui-table mt-3 w-full">
            <thead>
              <tr>
                <th>Tên</th>
                <th style={{ width: 130 }}>Loại</th>
                <th style={{ width: 100 }}>Nền tảng</th>
                <th style={{ width: 100 }}>Kết nối</th>
                <th style={{ width: 70 }}>Chu kỳ</th>
                <th style={{ width: 140 }}>Lần chạy</th>
                <th style={{ width: 100 }}>Trạng thái</th>
                <th style={{ width: 96 }} className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/biz/${slug}/dashboard/configs/${c.id}`} className="text-[13.5px] font-semibold hover:underline" style={{ color: "var(--ink-900)" }}>
                      {c.name}
                    </Link>
                  </td>
                  <td className="text-[13px]" style={{ color: "var(--ink-600)" }}>{TYPES.find((t) => t.id === c.type)?.label ?? c.type}</td>
                  <td className="text-[13px]" style={{ color: "var(--ink-600)" }}>{PROVIDER_LABEL[c.provider] ?? c.provider}</td>
                  <td className="truncate text-[13px]" style={{ color: "var(--ink-600)" }}>{connName(c.credentialId)}</td>
                  <td className="text-[13px]" style={{ color: "var(--ink-600)" }}>{c.intervalMinutes}p</td>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-600)" }}>
                    {c.lastRunAt ? new Date(c.lastRunAt).toLocaleString("vi-VN") : "chưa chạy"}
                    {c.lastRunStatus === "error" && (
                      <span className="ml-1" style={{ color: "var(--danger-ink)" }} title={c.lastError ?? ""}>· lỗi</span>
                    )}
                  </td>
                  <td>
                    <span
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold"
                      style={
                        c.status === "on"
                          ? { background: "var(--ok-bg)", color: "var(--ok-ink)" }
                          : c.status === "error"
                            ? { background: "var(--danger-bg)", color: "var(--danger-ink)" }
                            : { background: "var(--surface-3)", color: "var(--ink-500)" }
                      }
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: c.status === "on" ? "#22a55b" : c.status === "error" ? "var(--danger-ink)" : "var(--ink-400)" }}
                      />
                      {c.status === "on" ? "Đang chạy" : c.status === "error" ? "Lỗi" : "Tạm tắt"}
                    </span>
                  </td>
                  <td className="text-right">
                    {canManage && (
                      <span className="inline-flex items-center gap-2">
                        <button disabled={busy} onClick={() => patch(c.id, { status: c.status === "on" ? "off" : "on" })}
                          className="text-[12.5px] font-medium hover:underline disabled:opacity-50" style={{ color: "var(--brand)" }}>
                          {c.status === "on" ? "Tắt" : "Bật"}
                        </button>
                        <button disabled={busy} onClick={() => remove(c.id, c.name)}
                          className="text-[12.5px] font-medium hover:underline disabled:opacity-50" style={{ color: "var(--danger-ink)" }}>
                          Xoá
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Tab({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: (p: { size?: number; style?: React.CSSProperties }) => React.ReactElement;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[13px] font-medium transition-colors"
      style={
        active
          ? { background: "var(--surface-3)", color: "var(--ink-900)" }
          : { color: "var(--ink-500)" }
      }
    >
      <Icon size={14} style={{ color: active ? "var(--brand)" : "var(--ink-400)" }} />
      {label}
      <span
        className="rounded-full px-1.5 text-[11px] font-semibold"
        style={active ? { background: "var(--surface-3)", color: "var(--ink-500)" } : { background: "var(--surface-3)", color: "var(--ink-500)" }}
      >
        {count}
      </span>
    </button>
  );
}

const input = "w-full rounded-md border px-3 py-2 text-sm";
const lbl = "mb-3 block text-sm";
const lblIn = "mb-1 block text-zinc-600";

// ---------- Form Kéo chỉ số ----------
function MetricsPullForm({ slug, connections, onBack, onDone }: {
  slug: string; connections: ConnOpt[]; onBack: () => void; onDone: () => void;
}) {
  const metaConns = connections.filter((c) => c.provider === "meta_ads");
  const sheetConns = connections.filter((c) => c.provider === "google_sheets");
  const webhookConns = connections.filter((c) => c.provider === "webhook");

  const [v, setV] = useState<Record<string, string>>({
    provider: "facebook", name: "", intervalMinutes: "30",
    credentialId: "", adAccountId: "", sheetsConnId: "", sheetId: "", sheetTab: "Sheet1",
    webhookId: "", dateFrom: "", dateTo: "", writeMode: "update",
  });
  const [metrics, setMetrics] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));

  const adAccounts = (metaConns.find((c) => c.id === v.credentialId)?.meta?.adAccounts as { id: string; name: string }[] | undefined) ?? [];

  async function submit() {
    setSaving(true); setError("");
    const res = await fetch(`/api/biz/${slug}/configs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "metrics_pull", provider: v.provider, name: v.name, credentialId: v.credentialId || null,
        intervalMinutes: Number(v.intervalMinutes),
        params: {
          adAccountId: v.adAccountId, sheetsConnId: v.sheetsConnId, sheetId: v.sheetId, sheetTab: v.sheetTab,
          writeMode: v.writeMode, metrics: [...metrics],
          dateRange: v.dateFrom && v.dateTo ? { from: v.dateFrom, to: v.dateTo } : undefined,
          webhookId: v.webhookId || undefined,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Lỗi"); return; }
    onDone();
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 text-sm text-blue-600 hover:underline">← Chọn lại</button>
      <div className="mb-3 font-medium">Kéo chỉ số → Google Sheets</div>

      <div className="grid grid-cols-2 gap-3">
        <label className={lbl}><span className={lblIn}>Nền tảng *</span>
          <select className={input} value={v.provider} onChange={(e) => set("provider", e.target.value)}>
            <option value="facebook">Facebook</option><option value="tiktok">TikTok</option>
            <option value="google">Google Ads</option><option value="openai">OpenAI Ads</option>
          </select>
        </label>
        <label className={lbl}><span className={lblIn}>Tên cấu hình *</span>
          <input className={input} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Kéo chỉ số hàng ngày" />
        </label>
        <label className={lbl}><span className={lblIn}>Tần suất cập nhật</span>
          <select className={input} value={v.intervalMinutes} onChange={(e) => set("intervalMinutes", e.target.value)}>
            <option value="10">10 phút</option><option value="30">30 phút</option><option value="60">60 phút</option>
          </select>
        </label>
        <label className={lbl}><span className={lblIn}>Tài khoản quảng cáo *</span>
          <select className={input} value={v.credentialId} onChange={(e) => { set("credentialId", e.target.value); set("adAccountId", ""); }}>
            <option value="">— chọn kết nối Meta —</option>
            {metaConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {adAccounts.length > 0 && (
          <label className={lbl}><span className={lblIn}>Ad Account *</span>
            <select className={input} value={v.adAccountId} onChange={(e) => set("adAccountId", e.target.value)}>
              <option value="">— chọn TKQC —</option>
              {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
            </select>
          </label>
        )}
        <label className={lbl}><span className={lblIn}>Google Sheets kết nối *</span>
          <select className={input} value={v.sheetsConnId} onChange={(e) => set("sheetsConnId", e.target.value)}>
            <option value="">— chọn kết nối Sheets —</option>
            {sheetConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={lbl}><span className={lblIn}>Sheet ID *</span>
          <input className={input} value={v.sheetId} onChange={(e) => set("sheetId", e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs" />
        </label>
        <label className={lbl}><span className={lblIn}>Tab</span>
          <input className={input} value={v.sheetTab} onChange={(e) => set("sheetTab", e.target.value)} />
        </label>
        <label className={lbl}><span className={lblIn}>Webhook (tuỳ chọn)</span>
          <select className={input} value={v.webhookId} onChange={(e) => set("webhookId", e.target.value)}>
            <option value="">— không —</option>
            {webhookConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <label className={lbl}><span className={lblIn}>Kéo từ ngày</span>
            <input type="date" className={input} value={v.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} />
          </label>
          <label className={lbl}><span className={lblIn}>đến ngày</span>
            <input type="date" className={input} value={v.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
          </label>
        </div>
      </div>

      <div className="mb-3">
        <span className={lblIn}>Chế độ ghi</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={v.writeMode === "update"} onChange={() => set("writeMode", "update")} /> Cập nhật (upsert theo Ad ID)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={v.writeMode === "append"} onChange={() => set("writeMode", "append")} /> Ghi nối tiếp
          </label>
        </div>
      </div>

      <div className="mb-3">
        <span className={lblIn}>Chỉ số mặc định cố định ({FIXED_METRICS.length})</span>
        <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          {FIXED_METRICS.map((m) => m.label).join(", ")}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-zinc-600 text-sm">Chỉ số cần kéo ({metrics.size}/{META_METRICS.length})</span>
          <button type="button" className="text-xs text-blue-600 hover:underline"
            onClick={() => setMetrics(metrics.size === META_METRICS.length ? new Set() : new Set(META_METRICS.map((m) => m.id)))}>
            {metrics.size === META_METRICS.length ? "Bỏ hết" : "Chọn hết"}
          </button>
        </div>
        <div className="grid max-h-44 grid-cols-3 gap-1 overflow-y-auto rounded-md border p-2">
          {META_METRICS.map((m) => (
            <label key={m.id} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={metrics.has(m.id)}
                onChange={(e) => {
                  const s = new Set(metrics);
                  e.target.checked ? s.add(m.id) : s.delete(m.id);
                  setMetrics(s);
                }} />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <Dialog.Close className="rounded-md border px-4 py-2 text-sm">Hủy</Dialog.Close>
        <button onClick={submit} disabled={saving || !v.name || !v.credentialId || !v.sheetsConnId || !v.sheetId}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Đang tạo…" : "Tạo cấu hình"}
        </button>
      </div>
    </div>
  );
}

// ---------- Form Ads Autopilot ----------
function AutoPauseForm({ slug, connections, thresholds, onBack, onDone }: {
  slug: string; connections: ConnOpt[]; thresholds: ThresholdOpt[]; onBack: () => void; onDone: () => void;
}) {
  const metaConns = connections.filter((c) => c.provider === "meta_ads");
  const tgConns = connections.filter((c) => c.provider === "telegram");
  const aiConns = connections.filter((c) => ["gemini", "openai", "anthropic", "deepseek", "openai_compatible"].includes(c.provider));
  const qlbhConns = connections.filter((c) => c.provider.startsWith("pancake") || c.provider === "nhanhvn" || c.provider === "sapo");
  const wlConns = connections.filter((c) => c.provider === "page_whitelist");

  const [v, setV] = useState<Record<string, string>>({
    name: "", intervalMinutes: "30", credentialId: "", adAccountId: "",
    level: "campaign", thresholdId: "", protectedIds: "",
    telegramConnId: "", aiConnId: "", qlbhConnId: "", pageWhitelistConnId: "",
    autoRecreate: "", recreateBudget: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: string, x: string) => setV((s) => ({ ...s, [k]: x }));
  const adAccounts = (metaConns.find((c) => c.id === v.credentialId)?.meta?.adAccounts as { id: string; name: string }[] | undefined) ?? [];

  async function submit() {
    setSaving(true); setError("");
    const res = await fetch(`/api/biz/${slug}/configs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "auto_pause", provider: "facebook", name: v.name, credentialId: v.credentialId || null,
        intervalMinutes: Number(v.intervalMinutes),
        params: {
          adAccountId: v.adAccountId, level: v.level, thresholdId: v.thresholdId,
          protectedCampaignIds: v.protectedIds.split(",").map((s) => s.trim()).filter(Boolean),
          telegramConnId: v.telegramConnId, aiConnId: v.aiConnId,
          qlbhConnId: v.qlbhConnId || undefined, pageWhitelistConnId: v.pageWhitelistConnId || undefined,
          autoRecreate: v.autoRecreate ? { enabled: true, budget: Number(v.recreateBudget || 0) } : undefined,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Lỗi"); return; }
    onDone();
  }

  return (
    <div>
      <button onClick={onBack} className="mb-3 text-sm text-blue-600 hover:underline">← Chọn lại</button>
      <div className="mb-1 font-medium">Ads Autopilot</div>
      <p className="mb-3 text-xs text-zinc-500">Áp dụng cho chiến dịch tin nhắn, chuyển đổi (mua hàng), lead form</p>

      <div className="grid grid-cols-2 gap-3">
        <label className={lbl}><span className={lblIn}>Tên cấu hình *</span>
          <input className={input} value={v.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className={lbl}><span className={lblIn}>Tần suất kiểm tra</span>
          <select className={input} value={v.intervalMinutes} onChange={(e) => set("intervalMinutes", e.target.value)}>
            <option value="10">10 phút</option><option value="30">30 phút</option><option value="60">60 phút</option>
          </select>
        </label>
        <label className={lbl}><span className={lblIn}>TKQC *</span>
          <select className={input} value={v.credentialId} onChange={(e) => { set("credentialId", e.target.value); set("adAccountId", ""); }}>
            <option value="">— chọn kết nối Meta —</option>
            {metaConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {adAccounts.length > 0 && (
          <label className={lbl}><span className={lblIn}>Ad Account *</span>
            <select className={input} value={v.adAccountId} onChange={(e) => set("adAccountId", e.target.value)}>
              <option value="">— chọn TKQC —</option>
              {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
            </select>
          </label>
        )}
        <label className={lbl}><span className={lblIn}>Cấp độ điều kiện tắt</span>
          <select className={input} value={v.level} onChange={(e) => set("level", e.target.value)}>
            <option value="campaign">Chiến dịch (tắt cả cây)</option>
            <option value="adset">Nhóm quảng cáo</option>
            <option value="ad">Quảng cáo lẻ</option>
          </select>
        </label>
        <label className={lbl}><span className={lblIn}>Ngưỡng CPA *</span>
          <select className={input} value={v.thresholdId} onChange={(e) => set("thresholdId", e.target.value)}>
            <option value="">— chọn ngưỡng —</option>
            {thresholds.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.platform})</option>)}
          </select>
        </label>
        <label className={`${lbl} col-span-2`}><span className={lblIn}>Chiến dịch được bảo vệ (campaign IDs, phân cách phẩy)</span>
          <input className={input} value={v.protectedIds} onChange={(e) => set("protectedIds", e.target.value)} placeholder="1202xxx, 1203xxx" />
        </label>
        <label className={lbl}><span className={lblIn}>Telegram Bot *</span>
          <select className={input} value={v.telegramConnId} onChange={(e) => set("telegramConnId", e.target.value)}>
            <option value="">— chọn bot —</option>
            {tgConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={lbl}><span className={lblIn}>AI phân tích *</span>
          <select className={input} value={v.aiConnId} onChange={(e) => set("aiConnId", e.target.value)}>
            <option value="">— chọn AI —</option>
            {aiConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={lbl}><span className={lblIn}>Dữ liệu bán hàng QLBH (tuỳ chọn)</span>
          <select className={input} value={v.qlbhConnId} onChange={(e) => set("qlbhConnId", e.target.value)}>
            <option value="">— không —</option>
            {qlbhConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className={lbl}><span className={lblIn}>Whitelist Page (tuỳ chọn)</span>
          <select className={input} value={v.pageWhitelistConnId} onChange={(e) => set("pageWhitelistConnId", e.target.value)}>
            <option value="">— không —</option>
            {wlConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.autoRecreate === "1"} onChange={(e) => set("autoRecreate", e.target.checked ? "1" : "")} />
          Tự động lên mới chiến dịch bị tắt (clone + ngân sách mới)
        </label>
        {v.autoRecreate === "1" && (
          <label className={lbl}><span className={lblIn}>Ngân sách campaign mới (₫/ngày)</span>
            <input type="number" className={input} value={v.recreateBudget} onChange={(e) => set("recreateBudget", e.target.value)} />
          </label>
        )}
      </div>

      <p className="mb-3 text-xs text-zinc-500">Chưa có ngưỡng CPA? Tạo trước ở trang <a className="text-blue-600 underline" href={`/biz/${slug}/dashboard/cpa`}>Ngưỡng CPA</a>.</p>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end gap-2">
        <Dialog.Close className="rounded-md border px-4 py-2 text-sm">Hủy</Dialog.Close>
        <button onClick={submit} disabled={saving || !v.name || !v.credentialId || !v.thresholdId || !v.telegramConnId || !v.aiConnId}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Đang tạo…" : "Tạo cấu hình"}
        </button>
      </div>
    </div>
  );
}

// ---------- Wizard types → trang riêng ----------
function WizardRedirect({ slug, type, onBack }: { slug: string; type: string; onBack: () => void }) {
  const router = useRouter();
  const target = type === "budget_schedule" ? "budget-schedule" : "post-triggers/create";
  return (
    <div className="text-center">
      <p className="mb-4 text-sm text-zinc-600">Cấu hình này dùng wizard riêng nhiều bước.</p>
      <button onClick={onBack} className="mr-2 rounded-md border px-4 py-2 text-sm">← Chọn lại</button>
      <button onClick={() => router.push(`/biz/${slug}/dashboard/${target}?new=1`)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Mở wizard →
      </button>
    </div>
  );
}
