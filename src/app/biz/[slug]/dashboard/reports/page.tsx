// Báo cáo vận hành Biz — render theo "group" giống API gốc Done.vn.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/guard";
import { REPORT_PRESETS, resolveRange } from "@/lib/reports";
import { getBizGroups, getOverviewV2, getLlmUsageV2, type Metric, type ReportGroup } from "@/lib/report-groups";
import {
  IconBell,
  IconBolt,
  IconChart,
  IconChevron,
  IconGrid,
  IconInfo,
  IconLayers,
  IconMegaphone,
  IconPlug,
  IconPulse,
  IconRefresh,
} from "../icons";

export const dynamic = "force-dynamic";

function fmtMetric(k: Metric) {
  if (k.unit === "text") return k.text ?? "—";
  switch (k.unit) {
    case "currency":
      return `${k.value.toLocaleString("vi-VN")} đ`;
    case "ms":
      return `${k.value.toLocaleString("vi-VN")} ms`;
    case "percent":
      return `${k.value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
    default:
      return k.value.toLocaleString("vi-VN");
  }
}

function trendClass(k: Metric) {
  if (k.trend === "up_bad") return "var(--danger-ink)";
  if (k.trend === "up_good") return "var(--ok-ink)";
  if (k.trend === "down_bad") return "var(--danger-ink)";
  if (k.trend === "down_good") return "var(--ok-ink)";
  return "var(--ink-400)";
}

function Sparkline({ points, tone = "primary" }: { points: number[]; tone?: string }) {
  const max = Math.max(1, ...points);
  const color = tone === "red" ? "var(--danger-ink)" : tone === "amber" ? "var(--warn-ink)" : tone === "green" ? "var(--ok-ink)" : "var(--brand)";
  const w = 100;
  const h = 28;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(h - (p / max) * (h - 3) - 1.5).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function GroupTable({ table }: { table: ReportGroup["tables"][number] }) {
  if (!table.rows.length) {
    return (
      <p className="mt-2 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
        {table.empty}
      </p>
    );
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="ui-table w-full min-w-[420px]">
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.label} className="whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => {
                const kind = table.columns[j]?.kind ?? "text";
                const cls =
                  kind === "mono"
                    ? "font-mono text-[12px]"
                    : kind === "number" || kind === "vnd"
                      ? "tabular-nums"
                      : kind === "datetime"
                        ? "whitespace-nowrap"
                        : "";
                return (
                  <td key={j} className={`text-[13px] ${cls}`}>
                    {typeof cell === "number"
                      ? cell.toLocaleString("vi-VN")
                      : kind === "datetime" && cell
                        ? new Date(String(cell)).toLocaleString("vi-VN")
                        : (cell ?? "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupCard({ group, slug }: { group: ReportGroup; slug: string }) {
  const empty =
    group.metrics.every((m) => !m.value && !m.text) &&
    group.snapshot.every((m) => !m.value && !m.text) &&
    group.tables.every((t) => !t.rows.length);

  return (
    <section className="ui-card overflow-hidden p-0">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          <IconChart size={15} />
        </span>
        <h2 className="text-[14.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
          {group.title}
        </h2>
        <IconInfo size={13} style={{ color: "var(--ink-300)" }} />
        <Link
          href={`/biz/${slug}/${group.href}`}
          className="ml-auto shrink-0 text-[12.5px] font-medium hover:underline"
          style={{ color: "var(--brand)" }}
        >
          {group.href_label} →
        </Link>
      </div>

      <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--line)" }}>
        {group.description && (
          <p className="pt-3 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
            {group.description}
          </p>
        )}

        {group.snapshot.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {group.snapshot.map((m) => (
              <span
                key={m.key}
                className="rounded-lg px-2.5 py-1 text-[11.5px]"
                style={{ background: "var(--surface-3)", color: "var(--ink-600)" }}
              >
                {m.label}: <strong style={{ color: "var(--ink-900)" }}>{fmtMetric(m)}</strong>
              </span>
            ))}
          </div>
        )}

        {empty ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl border"
              style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink-300)" }}
            >
              <IconLayers size={21} />
            </span>
            <p className="mt-2.5 text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
              Chưa có dữ liệu trong kỳ
            </p>
            <p className="mt-1 max-w-[420px] text-[12.5px]" style={{ color: "var(--ink-500)" }}>
              {group.description || "Khi hệ thống ghi nhận hoạt động, số liệu sẽ xuất hiện ở đây."}
            </p>
            <Link href={`/biz/${slug}/${group.href}`} className="ui-btn mt-3">
              Mở {group.href_label.toLowerCase()}
            </Link>
          </div>
        ) : (
          <>
            {group.metrics.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {group.metrics.map((m) => (
                  <div key={m.key} className="rounded-xl px-3 py-2.5" style={{ background: "var(--surface-3)" }}>
                    <div className="text-[11.5px] leading-tight" style={{ color: "var(--ink-500)" }}>
                      {m.label}
                    </div>
                    <div
                      className="mt-1 text-[17px] font-bold tabular-nums"
                      style={{ color: m.trend === "up_bad" ? "var(--danger-ink)" : "var(--ink-900)" }}
                    >
                      {fmtMetric(m)}
                    </div>
                    {m.prev !== null && m.prev !== undefined && (
                      <div className="text-[11px]" style={{ color: trendClass(m) }}>
                        kỳ trước {m.prev.toLocaleString("vi-VN")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {group.series.length > 0 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.series.map((s) => (
                  <div key={s.key} className="rounded-xl border p-2.5" style={{ borderColor: "var(--line)" }}>
                    <div className="flex items-center justify-between text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                      <span>{s.label}</span>
                      <span className="tabular-nums">{s.points.reduce((a, b) => a + b, 0).toLocaleString("vi-VN")}</span>
                    </div>
                    <Sparkline points={s.points} tone={s.tone} />
                  </div>
                ))}
              </div>
            )}

            {group.tables.map((t) => (
              <div key={t.key} className="mt-3">
                <div className="text-[12.5px] font-semibold" style={{ color: "var(--ink-700)" }}>
                  {t.title}
                </div>
                <GroupTable table={t} />
              </div>
            ))}
          </>
        )}

        {group.note && (
          <p
            className="mt-3 rounded-xl px-3 py-2 text-[12px] leading-snug"
            style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
          >
            {group.note}
          </p>
        )}
      </div>
    </section>
  );
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const sp = await searchParams;
  const range = resolveRange(sp.preset, sp.from, sp.to);
  const [report, overview, llm] = await Promise.all([
    getBizGroups(m.biz.id, range),
    getOverviewV2(m.biz.id, range),
    getLlmUsageV2(m.biz.id, range),
  ]);

  const base = `/biz/${slug}/dashboard/reports`;
  const quota = overview.quota;
  const events = report.headline.find((k) => k.key === "events");
  const errors = report.headline.find((k) => k.key === "errors");

  const stats = [
    {
      label: "Sự kiện",
      value: events ? fmtMetric(events) : "0",
      suffix:
        events?.trend === "up_good" || events?.trend === "up_bad"
          ? "↑ mới"
          : events?.prev !== null && events?.prev !== undefined
            ? `kỳ trước ${events.prev.toLocaleString("vi-VN")}`
            : "",
      Icon: IconPulse,
      bg: "var(--brand-soft)",
      fg: "var(--brand)",
      hint: "Lượt AI, bài khớp từ khoá, MCP call và thao tác được ghi nhật ký.",
    },
    {
      label: "Lỗi",
      value: errors ? fmtMetric(errors) : "0",
      suffix: errors && errors.value > 0 ? "cần xem lại" : "Chưa có",
      Icon: IconBell,
      bg: "var(--danger-bg)",
      fg: "var(--danger-ink)",
      hint: "Lượt gọi AI lỗi, tạo chiến dịch lỗi và MCP call lỗi.",
    },
    {
      label: "Cấu hình lỗi",
      value: `${overview.summary.configs_failing}/${overview.summary.configs_total}`,
      suffix: overview.summary.configs_active ? `${overview.summary.configs_active} đang bật` : "",
      Icon: IconBolt,
      bg: "var(--warn-bg)",
      fg: "var(--warn-ink)",
      hint: "Số cấu hình chạy lỗi trên tổng số cấu hình của Biz.",
    },
    {
      label: "Chiến dịch mới",
      value: overview.summary.campaigns_created.toLocaleString("vi-VN"),
      suffix: overview.summary.policy_blocked ? `${overview.summary.policy_blocked} bị chặn` : "",
      Icon: IconMegaphone,
      bg: "var(--ok-bg)",
      fg: "var(--ok-ink)",
      hint: "Chiến dịch được tạo tự động từ bài đăng mới trong kỳ.",
    },
  ];

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="ui-h1">Báo cáo</h1>
          <p className="ui-sub mt-2 max-w-[720px]">
            Mọi hoạt động của Biz theo kỳ bạn chọn: cấu hình tự động, kết nối, AI, MCP, thành viên, gói cước, hỗ trợ và
            nhật ký thao tác.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <details className="relative">
            <summary
              className="inline-flex h-[38px] cursor-pointer list-none items-center gap-2 rounded-xl border bg-[var(--card)] px-3 text-[13px] font-medium"
              style={{ borderColor: "var(--line)", color: "var(--ink-700)" }}
            >
              {report.label}
              <span style={{ color: "var(--ink-400)" }}>
                {range.from.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} -{" "}
                {range.to.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
              </span>
              <IconChevron size={13} style={{ color: "var(--ink-400)" }} />
            </summary>
            <div
              className="absolute right-0 z-20 mt-1 w-[190px] overflow-hidden rounded-xl border bg-[var(--card)] py-1 shadow-lg"
              style={{ borderColor: "var(--line)" }}
            >
              {REPORT_PRESETS.map((p) => (
                <Link
                  key={p.value}
                  href={`${base}?preset=${p.value}`}
                  className="flex h-8 items-center justify-between px-3 text-[13px]"
                  style={
                    range.preset === p.value
                      ? { color: "var(--brand)", background: "var(--brand-soft)", fontWeight: 600 }
                      : { color: "var(--ink-700)" }
                  }
                >
                  {p.label}
                  {range.preset === p.value && <span>✓</span>}
                </Link>
              ))}
            </div>
          </details>
          <Link href={`${base}?preset=${range.preset}`} className="ui-btn shrink-0" style={{ height: 38 }}>
            <IconRefresh size={14} />
            Làm mới
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="ui-card flex items-center gap-3 p-4" title={s.hint}>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: s.bg, color: s.fg }}
            >
              <s.Icon size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[12px]" style={{ color: "var(--ink-500)" }}>
                {s.label}
                <IconInfo size={11} style={{ color: "var(--ink-300)" }} />
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-[22px] font-bold leading-none tabular-nums" style={{ color: "var(--ink-900)" }}>
                  {s.value}
                </span>
                {s.suffix && (
                  <span className="whitespace-nowrap text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                    {s.suffix}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-start gap-2 px-1 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
        <IconInfo size={14} className="mt-0.5 shrink-0" style={{ color: "var(--ink-400)" }} />
        <span>
          Số liệu tính theo <strong style={{ color: "var(--ink-700)" }}>{report.label}</strong> (
          {range.from.toLocaleString("vi-VN")} – {range.to.toLocaleString("vi-VN")}), múi giờ {report.timezone}, gộp theo{" "}
          {report.bucket === "hour" ? "giờ" : report.bucket === "month" ? "tháng" : "ngày"}. Cập nhật lần cuối lúc{" "}
          {new Date().toLocaleTimeString("vi-VN")}.
        </span>
      </div>

      <div className="mt-3 grid gap-3">
        {report.groups.map((g) => (
          <GroupCard key={g.key} group={g} slug={slug} />
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="ui-card p-4">
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-500)" }}>
            <IconChart size={13} /> Lượt gọi AI
          </div>
          <div className="mt-1 text-[20px] font-bold tabular-nums" style={{ color: "var(--ink-900)" }}>
            {llm.totals.calls.toLocaleString("vi-VN")}
          </div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
            {llm.totals.tokens_in.toLocaleString("vi-VN")} in · {llm.totals.tokens_out.toLocaleString("vi-VN")} out · $
            {llm.totals.cost_usd.toFixed(4)}
          </div>
        </div>
        <div className="ui-card p-4">
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-500)" }}>
            <IconPlug size={13} /> Kết nối khoẻ
          </div>
          <div className="mt-1 text-[20px] font-bold tabular-nums" style={{ color: "var(--ink-900)" }}>
            {overview.connections.healthy}/{overview.connections.total}
          </div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
            {overview.connections.warning} cảnh báo · {overview.connections.dead} lỗi
          </div>
        </div>
        <div className="ui-card p-4">
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-500)" }}>
            <IconGrid size={13} /> Hạn mức TKQC
          </div>
          <div className="mt-1 text-[20px] font-bold tabular-nums" style={{ color: "var(--ink-900)" }}>
            {quota.tkqc.current}/{quota.tkqc.quota}
          </div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
            {quota.qlbh.current}/{quota.qlbh.quota} QLBH · {quota.staff.current}/{quota.staff.quota} staff
          </div>
        </div>
        <div className="ui-card p-4">
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-500)" }}>
            <IconLayers size={13} /> Gói hiện tại
          </div>
          <div className="mt-1 text-[20px] font-bold" style={{ color: "var(--ink-900)" }}>
            {quota.sub_status}
          </div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
            {quota.days_remaining === null ? "không thời hạn" : `còn ${quota.days_remaining} ngày`} · đồng bộ{" "}
            {quota.frequency_minutes} phút/lần
          </div>
        </div>
      </div>

      <p className="mt-4 text-right text-[11px]" style={{ color: "var(--ink-400)" }}>
        {report.timezone} · {report.bucket} · {report.buckets.length} mốc · {report.elapsed_ms} ms
      </p>
    </main>
  );
}
