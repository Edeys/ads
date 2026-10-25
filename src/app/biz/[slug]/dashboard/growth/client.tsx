"use client";

import { useCallback, useEffect, useState } from "react";
import { IconRefresh } from "../icons";

type Metric = { key: string; label: string; value: number; unit: "number" | "currency" | "percent" };
type Section = {
  source: string;
  label: string;
  status: "ok" | "error" | "no_data";
  connectionName: string;
  account: string | null;
  dateRange: { start: string; end: string; label: string };
  metrics: Metric[];
  series: { label: string; points: number[] }[];
  error: string | null;
};
type Overview = { generatedAt: string; sections: Section[] };

const STATUS: Record<string, { label: string; bg: string; ink: string }> = {
  ok: { label: "Dữ liệu sống", bg: "var(--ok-bg)", ink: "var(--ok-ink)" },
  no_data: { label: "Chưa có dữ liệu", bg: "var(--surface-3)", ink: "var(--ink-500)" },
  error: { label: "Lỗi nguồn", bg: "var(--danger-bg)", ink: "var(--danger-ink)" },
};

function fmt(m: Metric) {
  const v = m.value.toLocaleString("vi-VN", { maximumFractionDigits: m.unit === "percent" ? 2 : 0 });
  if (m.unit === "currency") return `${v} đ`;
  if (m.unit === "percent") return `${v}%`;
  return v;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-7" />;
  const max = Math.max(1, ...points);
  const w = 100;
  const h = 28;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(h - (p / max) * (h - 3) - 1.5).toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function GrowthClient({ slug }: { slug: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/biz/${slug}/growth`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Không kéo được dữ liệu");
      setData(j);
    } catch (e: any) {
      setErr(e.message ?? "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const okCount = data?.sections.filter((s) => s.status === "ok").length ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--ink-900)" }}>
            Xem trước dữ liệu tăng trưởng
          </h1>
          <p className="mt-1 max-w-[560px] text-[13px]" style={{ color: "var(--ink-500)" }}>
            Kéo số liệu thật từ mọi nguồn đã kết nối: Search Console, GA4, Clarity, Meta Ads. Mỗi nguồn có khoảng
            ngày và trạng thái riêng — nguồn lỗi không làm mất nguồn khác.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="ui-btn" style={{ height: 38 }}>
          <IconRefresh size={15} />
          {loading ? "Đang kéo…" : "Làm mới"}
        </button>
      </div>

      {err && (
        <div className="mt-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger-ink)" }}>
          {err}
        </div>
      )}

      {loading && !data && (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[168px] animate-pulse rounded-2xl" style={{ background: "var(--surface-2)" }} />
          ))}
        </div>
      )}

      {data && data.sections.length === 0 && (
        <div className="mt-6 rounded-2xl border p-8 text-center" style={{ borderColor: "var(--line)" }}>
          <div className="text-[15px] font-semibold" style={{ color: "var(--ink-800)" }}>
            Chưa có nguồn dữ liệu nào được kết nối
          </div>
          <p className="mx-auto mt-1 max-w-[420px] text-[13px]" style={{ color: "var(--ink-500)" }}>
            Vào <b>Kết nối</b> để thêm Search Console, GA4, Clarity hoặc Meta Ads — quay lại đây để xem preview số
            liệu thật của từng nguồn.
          </p>
          <a href={`/biz/${slug}/dashboard/connections`} className="ui-btn-primary mt-4 inline-block" style={{ height: 38, lineHeight: "38px", padding: "0 16px" }}>
            Đến màn Kết nối
          </a>
        </div>
      )}

      {data && data.sections.length > 0 && (
        <>
          <div className="mt-3 text-[12px]" style={{ color: "var(--ink-400)" }}>
            {okCount}/{data.sections.length} nguồn có dữ liệu · kéo lúc{" "}
            {new Date(data.generatedAt).toLocaleTimeString("vi-VN")}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {data.sections.map((s, i) => {
              const st = STATUS[s.status];
              return (
                <div key={i} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
                        {s.label}
                      </div>
                      <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                        {s.account ?? s.connectionName} · {s.dateRange.label}
                      </div>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: st.bg, color: st.ink }}>
                      {st.label}
                    </span>
                  </div>

                  {s.status === "ok" && (
                    <>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {s.metrics.map((m) => (
                          <div key={m.key} className="rounded-xl px-3 py-2" style={{ background: "var(--surface-2)" }}>
                            <div className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
                              {m.label}
                            </div>
                            <div className="text-[16px] font-bold" style={{ color: "var(--ink-900)" }}>
                              {fmt(m)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {s.series.map((ser, j) =>
                        ser.points.length > 1 ? (
                          <div key={j} className="mt-2">
                            <div className="text-[10.5px]" style={{ color: "var(--ink-400)" }}>
                              {ser.label} ({ser.points.length} ngày)
                            </div>
                            <Sparkline points={ser.points} />
                          </div>
                        ) : null,
                      )}
                    </>
                  )}

                  {s.status !== "ok" && s.error && (
                    <div className="mt-3 rounded-xl px-3 py-2 text-[12px]" style={{ background: "var(--surface-2)", color: "var(--ink-500)" }}>
                      {s.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
