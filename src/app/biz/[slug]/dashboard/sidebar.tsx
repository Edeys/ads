"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CommandMenu } from "./command-menu";
import {
  IconBolt,
  IconBook,
  IconChart,
  IconChevron,
  IconCollapse,
  IconGrid,
  IconLifebuoy,
  IconMegaphone,
  IconPlug,
  IconPulse,
  IconSettings,
  IconSparkle,
  IconTerminal,
} from "./icons";

type Item = { label: string; href: string };
type Group = {
  key: string;
  label: string;
  Icon: (p: { size?: number }) => React.ReactElement;
  href?: string;
  items?: Item[];
};

const navFor = (slug: string): Group[] => [
  { key: "overview", label: "Tổng quan", Icon: IconGrid, href: `/biz/${slug}/dashboard` },
  {
    key: "metrics",
    label: "Chỉ số quảng cáo",
    Icon: IconChart,
    items: [
      { label: "Hiển thị kết quả", href: `/biz/${slug}/dashboard/ad-metrics` },
      { label: "Cấu hình", href: `/biz/${slug}/dashboard/ad-metrics/settings` },
    ],
  },
  {
    key: "automation",
    label: "Tự động hoá",
    Icon: IconBolt,
    items: [
      { label: "Tất cả cấu hình", href: `/biz/${slug}/dashboard/configs` },
      { label: "Kéo chỉ số", href: `/biz/${slug}/dashboard/configs?filter=metrics` },
      { label: "Ads Autopilot", href: `/biz/${slug}/dashboard/configs?filter=auto-pause` },
      { label: "Tăng giảm ngân sách", href: `/biz/${slug}/dashboard/budget-schedule` },
      { label: "Tự động chạy ads", href: `/biz/${slug}/dashboard/configs?filter=auto-run` },
      { label: "Ngưỡng CPA", href: `/biz/${slug}/dashboard/cpa` },
    ],
  },
  {
    key: "quickads",
    label: "Quảng cáo nhanh",
    Icon: IconMegaphone,
    items: [
      { label: "Đăng quảng cáo nhanh", href: `/biz/${slug}/dashboard/quick-ads` },
      { label: "Mẫu quảng cáo", href: `/biz/${slug}/dashboard/quick-ads/templates` },
    ],
  },
  { key: "connections", label: "Kết nối", Icon: IconPlug, href: `/biz/${slug}/dashboard/connections` },
  {
    key: "analytics",
    label: "Phân tích",
    Icon: IconPulse,
    items: [
      { label: "Báo cáo", href: `/biz/${slug}/dashboard/reports` },
      { label: "Nhật ký", href: `/biz/${slug}/dashboard/activity` },
    ],
  },
  {
    key: "mcp",
    label: "MCP Server",
    Icon: IconTerminal,
    items: [
      { label: "API key MCP", href: `/biz/${slug}/dashboard/mcp-keys` },
      { label: "Bộ chỉ số", href: `/biz/${slug}/dashboard/mcp-keys/field-presets` },
      { label: "Skill Hub", href: `/biz/${slug}/dashboard/mcp-keys/skills` },
    ],
  },
  {
    key: "social",
    label: "Social & Tự động",
    Icon: IconSparkle,
    items: [
      { label: "Bình luận Facebook", href: `/biz/${slug}/dashboard/comments` },
      { label: "Đăng bài tự động", href: `/biz/${slug}/dashboard/publisher` },
      { label: "n8n & Webhook", href: `/biz/${slug}/dashboard/n8n` },
      { label: "Custom tools", href: `/biz/${slug}/dashboard/tools` },
    ],
  },
  { key: "support", label: "Hỗ trợ", Icon: IconLifebuoy, href: `/biz/${slug}/dashboard/support` },
  { key: "docs", label: "Hướng dẫn", Icon: IconBook, href: `/biz/${slug}/dashboard/huong-dan` },
];

function stripQuery(href: string) {
  return href.split("?")[0];
}

export function Sidebar({
  slug,
  tokensIn,
  tokensOut,
}: {
  slug: string;
  tokensIn: number;
  tokensOut: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const groups = navFor(slug);
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);

  // Giữ trạng thái thu gọn giữa các lần điều hướng
  useEffect(() => {
    try {
      const raw = localStorage.getItem("adsync.nav");
      if (raw) {
        const saved = JSON.parse(raw) as { collapsed?: boolean; closed?: string[] };
        setCollapsed(Boolean(saved.collapsed));
        setClosed(Array.isArray(saved.closed) ? saved.closed : []);
      }
    } catch {
      /* localStorage không có cũng không sao */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("adsync.nav", JSON.stringify({ collapsed, closed }));
    } catch {
      /* bỏ qua */
    }
  }, [collapsed, closed]);

  const isActive = (href: string) => {
    const base = stripQuery(href).replace(/\/$/, "");
    const here = (pathname ?? "").replace(/\/$/, "");
    if (here !== base) return false;
    const qs = href.split("?")[1] ?? "";
    const wantFilter = new URLSearchParams(qs).get("filter");
    const currentFilter = searchParams.get("filter");
    // Cùng route nhưng khác bộ lọc: chỉ mục đúng filter mới sáng.
    if (wantFilter) return wantFilter === currentFilter;
    if (base.endsWith("/configs")) return !currentFilter;
    return true;
  };

  const groupHasActive = (g: Group) =>
    (g.href ? isActive(g.href) : false) || (g.items ?? []).some((i) => isActive(i.href));

  const toggleGroup = (key: string) =>
    setClosed((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <aside
      className={`sticky top-14 hidden h-[calc(100vh-56px)] shrink-0 flex-col overflow-hidden border-r md:flex ${
        collapsed ? "w-[68px]" : "w-[240px]"
      }`}
      style={{ background: "var(--sidebar-bg)", borderColor: "var(--line)" }}
    >
      {/* Tìm kiếm */}
      {!collapsed && (
        <div className="px-3 pb-1 pt-3">
          <CommandMenu slug={slug} variant="sidebar" />
        </div>
      )}

      {/* Nav — có fade ở đáy để biết còn mục bên dưới */}
      <div className="relative min-h-0 flex-1">
        <nav className="ui-scroll h-full overflow-y-auto px-2.5 pb-4">
        {groups.map((g) => {
          const active = groupHasActive(g);
          const isClosed = closed.includes(g.key) && !active;
          const Icon = g.Icon;

          if (!g.items) {
            return (
              <Link
                key={g.key}
                href={g.href!}
                title={g.label}
                className={`relative mb-0.5 flex h-[34px] items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] font-medium transition-colors ${
                  collapsed ? "justify-center px-0" : ""
                }`}
                style={
                  active
                    ? { background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 600 }
                    : { color: "var(--ink-700)" }
                }
              >
                <Icon size={17} />
                {!collapsed && <span className="truncate">{g.label}</span>}
              </Link>
            );
          }

          return (
            <div key={g.key} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                title={g.label}
                className={`flex h-[34px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-2)] ${
                  collapsed ? "justify-center px-0" : ""
                }`}
                style={active ? { color: "var(--ink-900)", fontWeight: 650 } : { color: "var(--ink-600)" }}
              >
                <Icon size={17} />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-left">{g.label}</span>
                    <IconChevron
                      size={14}
                      style={{ color: "var(--ink-300)", transform: isClosed ? "rotate(-90deg)" : "none", transition: "transform .15s" }}
                    />
                  </>
                )}
              </button>

              {!collapsed && (
                <div
                  className="grid overflow-hidden transition-all"
                  style={{ gridTemplateRows: isClosed ? "0fr" : "1fr" }}
                >
                  <div className="min-h-0">
                    {(g.items ?? []).map((it) => {
                      const itemActive = isActive(it.href);
                      return (
                        <Link
                          key={it.href + it.label}
                          href={it.href}
                          className="relative mb-px flex h-[30px] items-center rounded-[8px] pl-9 pr-3 text-[13px] transition-colors hover:bg-[var(--surface-2)]"
                          style={
                            itemActive
                              ? { background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 600 }
                              : { color: "var(--ink-600)" }
                          }
                        >
                          <span className="truncate">{it.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </nav>
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
          style={{ background: "linear-gradient(to top, var(--sidebar-bg), transparent)" }}
        />
      </div>

      {/* Chân sidebar */}
      <div className="shrink-0 border-t px-2.5 py-2.5" style={{ borderColor: "var(--line)" }}>
        <Link
          href={`/biz/${slug}/settings`}
          className={`mb-1.5 flex h-[32px] items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--surface-2)] ${
            collapsed ? "justify-center px-0" : ""
          }`}
          style={{ color: "var(--ink-600)" }}
          title="Cài đặt Biz"
        >
          <IconSettings size={17} />
          {!collapsed && <span className="truncate">Cài đặt Biz</span>}
        </Link>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={`flex h-[30px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-2)] ${
            collapsed ? "justify-center px-0" : ""
          }`}
          style={{ color: "var(--ink-500)" }}
          title={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
        >
          <IconCollapse size={16} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Thu gọn</span>
              <span
                className="rounded-[5px] border px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ borderColor: "var(--line)", color: "var(--ink-400)" }}
              >
                Ctrl B
              </span>
            </>
          )}
        </button>

        {!collapsed && (
          <div className="mt-2 rounded-[10px] px-2.5 py-2" style={{ background: "var(--surface-2)" }}>
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--ink-500)" }}>
              <IconSparkle size={13} style={{ color: "var(--brand)" }} />
              Token AI · tháng này
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10.5px]" style={{ color: "var(--ink-400)" }}>
                  Token in
                </div>
                <div className="text-[13.5px] font-bold" style={{ color: "var(--ink-900)" }}>
                  {tokensIn.toLocaleString("vi-VN")}
                </div>
              </div>
              <div>
                <div className="text-[10.5px]" style={{ color: "var(--ink-400)" }}>
                  Token out
                </div>
                <div className="text-[13.5px] font-bold" style={{ color: "var(--ink-900)" }}>
                  {tokensOut.toLocaleString("vi-VN")}
                </div>
              </div>
            </div>
            <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--ink-400)" }}>
              Dữ liệu lưu trên máy bạn
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
