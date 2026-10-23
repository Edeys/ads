"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconBolt,
  IconBook,
  IconCalendar,
  IconCheck,
  IconChevron,
  IconInfo,
  IconLayers,
  IconPlug,
  IconPlus,
  IconSparkle,
  IconWarning,
} from "./icons";
import { StatTile } from "@/components/stat-tile";

export type DashboardStats = {
  activeConfigs: number;
  totalConfigs: number;
  errorConfigs: number;
  healthyConns: number;
  totalConns: number;
  aiCostUsd: number;
  aiTokens: number;
};

export type ChecklistItem = {
  step: number;
  title: string;
  desc: string;
  done: boolean;
  href: string;
  cta: string;
};

export type RecentActivity = {
  id: string;
  action: string;
  status: string;
  objectType: string | null;
  createdAt: string;
  actorEmail: string | null;
};

export type AutomationRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  lastRunAt: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  metrics_pull: "Kéo chỉ số",
  auto_pause: "Tự động tắt ads",
  auto_run: "Tự động chạy ads",
  budget: "Tăng giảm ngân sách",
  budget_schedule: "Lịch ngân sách",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function StatCard(props: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "ok" | "warn" | "brand";
  Icon: (p: { size?: number }) => React.ReactElement;
}) {
  return <StatTile {...props} />;
}

export function DashboardClient({
  slug,
  bizName,
  userName,
  stats,
  checklist,
  recentActivity,
  automations,
}: {
  slug: string;
  bizName: string;
  userName: string;
  stats: DashboardStats;
  checklist: ChecklistItem[];
  recentActivity: RecentActivity[];
  automations: AutomationRow[];
}) {
  const completedCount = checklist.filter((c) => c.done).length;
  const progressPct = checklist.length ? Math.round((completedCount / checklist.length) * 100) : 0;
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(
    checklist.find((c) => !c.done)?.step ?? null,
  );

  const today = new Date();
  const dateLabel = `${today.toLocaleDateString("vi-VN", { weekday: "long" })}${today
    .toLocaleDateString("vi-VN", { weekday: "long" })
    .startsWith("Thứ") ? "," : ""} ${today.getDate()} tháng ${today.getMonth() + 1}`;

  return (
    <main className="px-[18px] pb-10 pt-6">
      {/* Lời chào + hành động nhanh */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">
            {greeting()}, ({userName})
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
            <IconCalendar size={14} />
            <span className="capitalize">{dateLabel}</span>
            <span>·</span>
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[8.5px] font-bold text-white"
              style={{ background: "var(--brand)" }}
            >
              {bizName.charAt(0).toUpperCase()}
            </span>
            <span className="font-medium" style={{ color: "var(--ink-600)" }}>
              {bizName}
            </span>
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/biz/${slug}/dashboard/connections`}
            className="ui-btn gap-1.5"
            style={{ height: 36 }}
          >
            <IconPlug size={15} />
            Thêm kết nối
          </Link>
          <Link
            href={`/biz/${slug}/dashboard/configs`}
            className="ui-btn-primary gap-1.5"
            style={{ height: 36 }}
          >
            <IconPlus size={15} />
            Thêm cấu hình
          </Link>
        </div>
      </div>

      {/* 4 thẻ số liệu */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          Icon={IconLayers}
          label="Cấu hình chạy"
          value={`${stats.activeConfigs}/${stats.totalConfigs}`}
          hint="Tổng số cấu hình đang bật trên tổng số cấu hình đã tạo"
          tone="brand"
        />
        <StatCard
          Icon={IconWarning}
          label="Đang lỗi"
          value={String(stats.errorConfigs)}
          hint="Cấu hình chạy lỗi ở lần gần nhất — cần kiểm tra token hoặc kết nối"
          tone={stats.errorConfigs > 0 ? "warn" : "neutral"}
        />
        <StatCard
          Icon={IconPlug}
          label="Kết nối khoẻ"
          value={`${stats.healthyConns}/${stats.totalConns}`}
          hint="Kết nối có API credentials còn hoạt động"
          tone={stats.totalConns > 0 && stats.healthyConns === stats.totalConns ? "ok" : "neutral"}
        />
        <StatCard
          Icon={IconSparkle}
          label="Chi phí AI"
          value={`$${stats.aiCostUsd.toFixed(2)}`}
          hint={`${stats.aiTokens.toLocaleString("vi-VN")} token đã dùng trong tháng này`}
        />
      </div>

      {/* Bắt đầu thiết lập */}
      {!hidden && (
        <section className="ui-card mb-4 overflow-hidden p-0">
          <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: "var(--brand)" }}
              >
                <IconSparkle size={16} />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink-900)" }}>
                  Bắt đầu thiết lập
                </h2>
                <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                  Hoàn thành {checklist.length} bước để AdsSync chạy quảng cáo thay bạn.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHidden(true)}
              className="text-[12.5px] font-medium"
              style={{ color: "var(--ink-500)" }}
            >
              Ẩn
            </button>
          </div>

          <div className="flex items-center gap-3 px-5 pb-3">
            <span className="text-[12px] font-medium" style={{ color: "var(--ink-600)" }}>
              {completedCount}/{checklist.length} bước hoàn thành
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, background: "var(--brand)" }}
              />
            </div>
            <span className="text-[12px] font-semibold" style={{ color: "var(--brand)" }}>
              {progressPct}%
            </span>
          </div>

          <div className="divide-y" style={{ borderColor: "var(--line)" }}>
            {checklist.map((item) => {
              const open = expanded === item.step;
              return (
                <div key={item.step} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : item.step)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                      style={
                        item.done
                          ? { background: "var(--ok-ink)", color: "var(--card)" }
                          : open
                            ? { background: "var(--brand)", color: "var(--card)" }
                            : { background: "var(--surface-3)", color: "var(--ink-500)" }
                      }
                    >
                      {item.done ? <IconCheck size={15} /> : item.step}
                    </span>
                    <span
                      className="flex-1 truncate text-[13.5px] font-medium"
                      style={{ color: item.done ? "var(--ink-600)" : "var(--ink-800)" }}
                    >
                      {item.title}
                    </span>
                    <IconChevron
                      size={16}
                      style={{
                        color: "var(--ink-400)",
                        transform: open ? "rotate(180deg)" : "none",
                        transition: "transform .15s",
                      }}
                    />
                  </button>

                  {open && (
                    <div className="flex items-center gap-3 px-5 pb-4 pl-[60px]">
                      <IconBook size={16} style={{ color: "var(--ink-400)", flexShrink: 0 }} />
                      <p className="flex-1 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                        {item.desc}
                      </p>
                      <Link
                        href={item.href}
                        className={item.done ? "ui-btn shrink-0" : "ui-btn-primary shrink-0"}
                        style={{ height: 34 }}
                      >
                        {item.done ? "Xem lại" : item.cta}
                        <IconArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Cấu hình tự động + Hoạt động gần đây */}
      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <section className="ui-card p-0">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                <IconBolt size={16} />
              </span>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
                Cấu hình tự động
              </h2>
            </div>
            <Link
              href={`/biz/${slug}/dashboard/configs`}
              className="flex items-center gap-1 text-[12.5px] font-medium"
              style={{ color: "var(--brand)" }}
            >
              Xem tất cả
              <IconArrowRight size={14} />
            </Link>
          </div>

          {automations.length === 0 ? (
            <p className="px-5 pb-5 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              Chưa có cấu hình nào. Bấm “Thêm cấu hình” để tạo cấu hình đầu tiên.
            </p>
          ) : (
            <div className="border-t" style={{ borderColor: "var(--line)" }}>
              {automations.map((c) => (
                <Link
                  key={c.id}
                  href={`/biz/${slug}/dashboard/configs/${c.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-3)]"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        c.status === "on" ? "var(--ok-ink)" : c.status === "error" ? "var(--danger-ink)" : "var(--ink-300)",
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium" style={{ color: "var(--ink-800)" }}>
                      {c.name}
                    </span>
                    <span className="block text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                      {TYPE_LABEL[c.type] ?? c.type}
                      {c.lastRunAt ? ` · chạy ${new Date(c.lastRunAt).toLocaleString("vi-VN")}` : " · chưa chạy"}
                    </span>
                  </span>
                  <IconChevron size={15} style={{ color: "var(--ink-300)", transform: "rotate(-90deg)" }} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="ui-card p-0">
          <div className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ background: "var(--ok-bg)", color: "var(--ok-ink)" }}
              >
                <IconSparkle size={16} />
              </span>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
                Hoạt động gần đây
              </h2>
            </div>
            <Link
              href={`/biz/${slug}/dashboard/activity`}
              className="flex items-center gap-1 text-[12.5px] font-medium"
              style={{ color: "var(--brand)" }}
            >
              Nhật ký
              <IconArrowRight size={14} />
            </Link>
          </div>

          {recentActivity.length === 0 ? (
            <p className="px-5 pb-5 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              Chưa có hoạt động nào được ghi lại.
            </p>
          ) : (
            <div className="border-t" style={{ borderColor: "var(--line)" }}>
              {recentActivity.map((act) => (
                <div key={act.id} className="flex items-center gap-2.5 px-5 py-2.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: act.status === "success" ? "var(--ok-ink)" : "var(--danger-ink)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--ink-700)" }}>
                    <span className="font-mono font-medium">{act.action}</span>
                    <span style={{ color: "var(--ink-400)" }}> · {act.actorEmail ?? "hệ thống"}</span>
                  </span>
                  <span className="shrink-0 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                    {new Date(act.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
