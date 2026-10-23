"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBook, IconChevron, IconGrid, IconLayers, IconPlug, IconSparkle } from "../dashboard/icons";

type Item = { label: string; href: string; Icon?: (p: { size?: number }) => React.ReactElement };
type Group = { label: string | null; items: Item[] };

/** Sidebar của khu Cài đặt — thay chỗ sidebar chính khi vào /settings/* (giống Done.vn). */
export function SettingsNav({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/biz/${slug}/settings`;

  const groups: Group[] = [
    { label: null, items: [{ label: "Tổng quan cài đặt", href: base, Icon: IconGrid }] },
    {
      label: "Cài đặt Biz",
      items: [
        { label: "Thông tin Biz", href: `${base}/biz`, Icon: IconGrid },
        { label: "Thành viên", href: `${base}/members`, Icon: IconPlug },
        { label: "Lời mời", href: `${base}/invites`, Icon: IconBook },
        { label: "Vai trò & quyền", href: `${base}/roles`, Icon: IconSparkle },
      ],
    },
    {
      label: "Tài chính",
      items: [
        { label: "Gói cước & thanh toán", href: `${base}/billing`, Icon: IconLayers },
        { label: "Hoá đơn", href: `${base}/invoices`, Icon: IconLayers },
      ],
    },
    {
      label: "Hệ thống",
      items: [{ label: "Ứng dụng OAuth", href: `${base}/oauth`, Icon: IconPlug }],
    },
  ];

  const isActive = (href: string) => pathname.replace(/\/$/, "") === href.replace(/\/$/, "");

  return (
    <aside
      className="sticky top-[58px] hidden h-[calc(100vh-58px)] w-[246px] shrink-0 flex-col overflow-hidden md:flex"
      style={{ background: "var(--sidebar-bg)" }}
    >
      <div className="px-3 pb-2 pt-3">
        <Link
          href={`/biz/${slug}/dashboard`}
          className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium"
          style={{ color: "var(--ink-600)" }}
        >
          <span className="text-[15px]">←</span>
          Quay lại ứng dụng
        </Link>
      </div>

      <nav className="ui-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        <div className="px-2.5 pb-1 pt-1 text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
          Cài đặt
        </div>

        {groups.map((g) => (
          <div key={g.label ?? "root"} className="mb-0.5">
            {g.label && (
              <div className="px-2.5 pb-1 pt-3 text-[11.5px] font-semibold" style={{ color: "var(--ink-400)" }}>
                {g.label}
              </div>
            )}
            {g.items.map((it) => {
              const active = isActive(it.href);
              const Icon = it.Icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="mb-0.5 flex h-[34px] items-center gap-2.5 rounded-xl px-3 text-[14px] transition-colors"
                  style={
                    active
                      ? {
                          background: "var(--card)",
                          color: "var(--brand)",
                          fontWeight: 600,
                          border: "1px solid var(--line)",
                          boxShadow: "0 1px 2px rgba(13,27,42,.04)",
                        }
                      : { color: "var(--ink-700)" }
                  }
                >
                  {Icon ? <Icon size={18} /> : <span className="w-[18px]" />}
                  <span className="truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 px-4 pb-3 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
        <span className="flex items-center gap-1">
          Dữ liệu lưu trên máy
          <IconChevron size={13} style={{ transform: "rotate(-90deg)" }} />
        </span>
      </div>
    </aside>
  );
}
