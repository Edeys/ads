"use client";

import { useMemo, useState } from "react";
import { IconChevron, IconFilter } from "../icons";
import { actionLabel, detailSummary, logTimeCell, objectLabel, statusMeta } from "@/lib/activity-labels";

export type LogRow = {
  id: string;
  action: string;
  status: string;
  objectType: string | null;
  objectId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
  actorEmail: string | null;
};

/** Nút lọc dạng pill có icon + chevron, bên dưới là <select> thật (ẩn) để giữ hành vi native. */
function FilterPill({
  icon,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <span
      className="relative inline-flex h-9 items-center gap-2 rounded-xl border bg-[var(--card)] pl-3 pr-8 text-[13.5px] font-medium"
      style={{ borderColor: "var(--line)", color: "var(--ink-700)" }}
    >
      <span style={{ color: "var(--ink-500)" }}>{icon}</span>
      <span className="max-w-[190px] truncate">{current?.label}</span>
      <IconChevron size={14} className="absolute right-2.5" style={{ color: "var(--ink-400)" }} />
      <select
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function ActivityClient({ rows }: { rows: LogRow[] }) {
  const [action, setAction] = useState("all");
  const [status, setStatus] = useState("all");
  const [actor, setActor] = useState("all");

  const actionOptions = useMemo(() => {
    const keys = [...new Set(rows.map((r) => r.action))].sort((a, b) =>
      actionLabel(a).localeCompare(actionLabel(b), "vi"),
    );
    return [{ value: "all", label: "Mọi hành động" }, ...keys.map((k) => ({ value: k, label: actionLabel(k) }))];
  }, [rows]);

  const statusOptions = useMemo(() => {
    const keys = [...new Set(rows.map((r) => r.status))];
    return [{ value: "all", label: "Mọi trạng thái" }, ...keys.map((k) => ({ value: k, label: statusMeta(k).label }))];
  }, [rows]);

  const actorOptions = useMemo(() => {
    const keys = [...new Set(rows.map((r) => r.actorEmail ?? "hệ thống"))].sort((a, b) => a.localeCompare(b, "vi"));
    return [{ value: "all", label: "Mọi người thực hiện" }, ...keys.map((k) => ({ value: k, label: k }))];
  }, [rows]);

  const visible = rows.filter(
    (r) =>
      (action === "all" || r.action === action) &&
      (status === "all" || r.status === status) &&
      (actor === "all" || (r.actorEmail ?? "hệ thống") === actor),
  );

  return (
    <main className="px-[18px] pb-10 pt-6">
      <h1 className="ui-h1">Nhật ký</h1>
      <p className="ui-sub mt-2 max-w-[720px]">
        Mỗi mốc hoạt động của Biz này trong 30 ngày gần nhất: lượt chạy cấu hình, thay đổi kết nối/khoá MCP, và thao
        tác chiến dịch/ngân sách.
      </p>

      <section className="ui-card mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-3">
          <FilterPill
            ariaLabel="Lọc theo hành động"
            icon={<IconFilter size={15} />}
            value={action}
            onChange={setAction}
            options={actionOptions}
          />
          <FilterPill
            ariaLabel="Lọc theo trạng thái"
            icon={<IconFilter size={15} />}
            value={status}
            onChange={setStatus}
            options={statusOptions}
          />
          <FilterPill
            ariaLabel="Lọc theo người thực hiện"
            icon={<IconFilter size={15} />}
            value={actor}
            onChange={setActor}
            options={actorOptions}
          />
        </div>

        <table className="ui-table w-full table-fixed [&_tbody_td]:px-3.5 [&_tbody_td]:py-[9px] [&_thead_th]:px-3.5 [&_thead_th]:py-2">
          <thead>
            <tr>
              <th style={{ width: 132 }}>Thời gian</th>
              <th style={{ width: 216 }}>Người thực hiện</th>
              <th style={{ width: 168 }}>Hành động</th>
              <th style={{ width: 128 }}>Trạng thái</th>
              <th style={{ width: 232 }}>Đối tượng</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[13px]" style={{ color: "var(--ink-400)" }}>
                  Chưa có hoạt động nào khớp bộ lọc.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const t = logTimeCell(r.createdAt);
                const st = statusMeta(r.status);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      <span className="text-[13px]" style={{ color: "var(--ink-700)" }}>
                        {t.time} {t.date}
                      </span>
                    </td>
                    <td className="truncate text-[13px]" style={{ color: "var(--ink-700)" }} title={r.actorEmail ?? ""}>
                      {r.actorEmail ?? "hệ thống"}
                    </td>
                    <td className="truncate text-[13px]" style={{ color: "var(--ink-800)" }}>
                      {actionLabel(r.action)}
                    </td>
                    <td>
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="truncate text-[13px]" style={{ color: "var(--ink-600)" }}>
                      {objectLabel(r.objectType)}
                      {r.objectId ? ` · ${r.objectId.slice(0, 14)}` : ""}
                    </td>
                    <td className="truncate text-[13px]" style={{ color: "var(--ink-500)" }}>
                      {detailSummary(r.detail)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="px-5 py-3 text-[13px]" style={{ color: "var(--ink-500)" }}>
          Đang hiện {visible.length} hoạt động
        </div>
      </section>
    </main>
  );
}
