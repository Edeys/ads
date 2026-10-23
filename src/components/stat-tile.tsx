"use client";

/**
 * Thẻ số liệu dùng chung.
 *
 * Trước đây mỗi màn tự dựng thẻ riêng nên kích thước, màu icon và khoảng cách
 * lệch nhau. Một component duy nhất để các màn nhìn như nhau.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "brand";
  Icon?: (p: { size?: number }) => React.ReactElement;
}) {
  const toneStyle = {
    neutral: { background: "var(--surface-3)", color: "var(--ink-500)" },
    ok: { background: "var(--ok-bg)", color: "var(--ok-ink)" },
    warn: { background: "var(--warn-bg)", color: "var(--warn-ink)" },
    brand: { background: "var(--brand-soft)", color: "var(--brand)" },
  }[tone];

  return (
    <div className="ui-card px-4 py-3.5" title={hint}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]"
            style={toneStyle}
          >
            <Icon size={15} />
          </span>
        )}
        <span className="text-[12px] font-medium leading-tight" style={{ color: "var(--ink-500)" }}>
          {label}
        </span>
      </div>
      <div
        className="mt-2 truncate text-[26px] font-bold leading-none tracking-[-0.02em]"
        style={{ color: "var(--ink-900)" }}
      >
        {typeof value === "number" ? value.toLocaleString("vi-VN") : value}
      </div>
    </div>
  );
}
