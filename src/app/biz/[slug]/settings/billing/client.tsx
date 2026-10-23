"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRICING } from "@/lib/pricing";
import { IconCheck, IconGrid, IconInfo, IconLayers, IconMegaphone, IconPlus, IconRefresh } from "../../dashboard/icons";

type Plan = {
  tier: string;
  quota: { tkqc: number; qlbh: number; staff: number; minSyncMinutes: number };
  status: string;
  startedAt: string;
  expiresAt: string | null;
};

type Invoice = {
  id: string;
  amount: number;
  status: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

const CYCLES = [
  { months: 3, label: "3 tháng", discount: 0 },
  { months: 6, label: "6 tháng", discount: 5 },
  { months: 12, label: "12 tháng", discount: 10 },
  { months: 24, label: "24 tháng", discount: 25 },
];

const HIGHLIGHT: Record<string, string | null> = { small: "Tiết kiệm nhất", pro: "Phổ biến" };

const money = (n: number) => n.toLocaleString("vi-VN");

export function BillingClient({
  slug,
  canPay,
  currentPlan,
  invoices,
}: {
  slug: string;
  canPay: boolean;
  currentPlan: Plan | null;
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cycle = CYCLES.find((c) => c.months === months) ?? CYCLES[2];
  const currentTier = PRICING.find((p) => p.tier === currentPlan?.tier) ?? PRICING[0];
  const daysLeft = currentPlan?.expiresAt
    ? Math.max(0, Math.ceil((new Date(currentPlan.expiresAt).getTime() - Date.now()) / 86_400_000))
    : 0;
  const totalDays = currentPlan
    ? Math.max(
        1,
        Math.round(
          (new Date(currentPlan.expiresAt ?? currentPlan.startedAt).getTime() -
            new Date(currentPlan.startedAt).getTime()) /
            86_400_000,
        ),
      )
    : 1;
  const pctLeft = Math.min(100, Math.round((daysLeft / totalDays) * 100));

  async function subscribe(tier: string) {
    setBusy(tier);
    setNotice(null);
    const res = await fetch(`/api/biz/${slug}/billing/invoices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier, months }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setNotice(
        j.error === "contact_required"
          ? "Gói Tuỳ chỉnh cần liên hệ — chưa thể đăng ký tự động."
          : j.error === "missing_permission"
            ? "Bạn không có quyền thanh toán cho Biz này."
            : "Không tạo được đơn đăng ký.",
      );
      return;
    }
    setNotice(`Đã tạo hoá đơn ${money(j.invoice.amount)}đ cho gói ${tier} · ${months} tháng (mô phỏng).`);
    router.refresh();
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">Gói cước &amp; thanh toán</h1>
          <p className="ui-sub mt-1.5">Chọn gói có sẵn hoặc tự cấu hình — giá cập nhật ngay khi đổi số lượng.</p>
        </div>
        <Link href={`/biz/${slug}/settings/invoices`} className="ui-btn" style={{ height: 36 }}>
          <IconLayers size={15} />
          Hoá đơn
        </Link>
      </div>

      {/* Gói hiện tại */}
      <section className="ui-card p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              <IconLayers size={20} />
            </span>
            <div>
              <div className="text-[12px]" style={{ color: "var(--ink-500)" }}>
                Gói hiện tại
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[20px] font-bold" style={{ color: "var(--ink-900)" }}>
                  {currentTier.name}
                </span>
                <span className="ui-chip" style={{ background: "var(--ok-bg)", color: "var(--ok-ink)" }}>
                  ● {currentPlan?.status === "active" ? "Đang chạy" : currentPlan?.status ?? "chưa đăng ký"}
                </span>
              </div>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                Biz đã có gói {currentTier.name} đang chạy
                {currentPlan?.expiresAt
                  ? ` · Hết hạn ${new Date(currentPlan.expiresAt).toLocaleDateString("vi-VN")}`
                  : " · chưa đặt hạn"}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="ui-btn-primary"
            style={{ height: 36 }}
            onClick={() => subscribe(currentTier.tier)}
            disabled={!canPay || busy !== null}
          >
            <IconPlus size={15} />
            Mua thêm
          </button>
        </div>

        <div className="px-5 pb-3 pt-3">
          <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--ink-500)" }}>
            <span>Thời hạn gói</span>
            <span>
              Còn {daysLeft}/{totalDays} ngày
            </span>
          </div>
          <div className="relative mt-1 h-1.5 rounded-full" style={{ background: "var(--surface-3)" }}>
            <div className="h-full rounded-full" style={{ width: `${pctLeft}%`, background: "var(--brand)" }} />
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-[var(--card)]"
              style={{ left: `calc(${pctLeft}% - 5px)`, borderColor: "var(--brand)" }}
            />
          </div>
        </div>

        <div className="px-5 pb-4">
          <div className="text-[12px]" style={{ color: "var(--ink-500)" }}>
            Quota hiện tại
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[
              { Icon: IconMegaphone, text: `${currentPlan?.quota.tkqc ?? currentTier.quota.tkqc} TKQC` },
              { Icon: IconLayers, text: `${currentPlan?.quota.qlbh ?? currentTier.quota.qlbh} QLBH` },
              { Icon: IconGrid, text: `${currentPlan?.quota.staff ?? currentTier.quota.staff} staff` },
              {
                Icon: IconRefresh,
                text: `sync mỗi ${currentPlan?.quota.minSyncMinutes ?? currentTier.quota.minSyncMinutes} phút`,
              },
            ].map(({ Icon, text }) => (
              <span
                key={text}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px]"
                style={{ color: "var(--ink-600)", background: "var(--surface-3)" }}
              >
                <Icon size={13} style={{ color: "var(--ink-400)" }} />
                {text}
              </span>
            ))}
          </div>
          <p
            className="mt-3 rounded-xl px-3 py-2.5 text-[12px]"
            style={{ color: "var(--ink-500)", background: "var(--surface-3)" }}
          >
            Chưa thể đăng ký gói mới chồng lên gói hiện tại. Nếu cần mua thêm kết nối, dùng nút “Mua thêm”.
          </p>
        </div>
      </section>

      {/* Chọn gói */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="ui-h2">Chọn gói</h2>
          <p className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: "var(--warn-ink)" }}>
            <IconInfo size={13} />
            Giá dưới đây đang trong giai đoạn thử nghiệm, chưa phải giá chính thức.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-[14px] p-1" style={{ background: "var(--surface-3)" }}>
          {CYCLES.map((c) => {
            const on = c.months === months;
            return (
              <button
                key={c.months}
                type="button"
                onClick={() => setMonths(c.months)}
                className="inline-flex items-center rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                style={
                  on
                    ? { background: "var(--card)", color: "var(--ink-900)", boxShadow: "0 1px 2px rgba(13,27,42,.08)" }
                    : { color: "var(--ink-500)" }
                }
              >
                {c.label}
                {c.discount > 0 && (
                  <span className="ml-1 rounded-md px-1 py-0.5 text-[10.5px] font-semibold" style={{ background: "var(--ok-bg)", color: "var(--ok-ink)" }}>
                    -{c.discount}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {notice && (
        <p className="mt-2 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-[12.5px]" style={{ color: "var(--brand)" }}>
          {notice}
        </p>
      )}

      <div className="ui-card mt-3 overflow-hidden p-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING.filter((p) => p.tier !== "trial").map((p) => {
            const isCurrent = p.tier === currentPlan?.tier;
            const popular = HIGHLIGHT[p.tier];
            const perMonth = p.price === null ? null : Math.round(p.price * (1 - cycle.discount / 100));
            const hot = popular === "Phổ biến";
            return (
              <div
                key={p.tier}
                className="relative flex flex-col border-t px-5 py-5 sm:border-l lg:border-t-0"
                style={{
                  borderColor: hot ? "var(--brand)" : "var(--line)",
                  background: hot ? "var(--brand-soft)" : "var(--card)",
                  boxShadow: hot ? "inset 0 0 0 1px var(--brand)" : undefined,
                }}
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[15px] font-semibold" style={{ color: "var(--ink-900)" }}>
                    {p.name}
                  </span>
                  {popular && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={
                        popular === "Phổ biến"
                          ? { background: "var(--brand)", color: "var(--card)" }
                          : popular === "Tuỳ chỉnh"
                            ? { background: "var(--brand-soft)", color: "var(--brand)" }
                            : { background: "var(--ok-bg)", color: "var(--ok-ink)" }
                      }
                    >
                      {popular}
                    </span>
                  )}
                </div>

                <div className="mt-2 min-h-[54px] text-right">
                  {perMonth === null ? (
                    <div className="text-[22px] font-bold" style={{ color: "var(--brand)" }}>
                      Liên hệ
                    </div>
                  ) : (
                    <>
                      <div className="whitespace-nowrap text-[22px] font-bold leading-tight" style={{ color: "var(--ink-900)" }}>
                        {money(perMonth)}
                        <span className="ml-0.5 text-[12px] font-medium">đ/tháng</span>
                      </div>
                      <div className="mt-1 text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                        Tổng {cycle.months} tháng:{" "}
                        <strong style={{ color: "var(--ink-700)" }}>{money(perMonth * cycle.months)}đ</strong>
                      </div>
                    </>
                  )}
                </div>

                <ul className="mt-3 flex-1 space-y-1.5 text-left">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11.5px]" style={{ color: "var(--ink-600)" }}>
                      <IconCheck size={13} style={{ color: "var(--ok-ink)", marginTop: 2, flexShrink: 0 }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => subscribe(p.tier)}
                  disabled={!canPay || isCurrent || busy !== null || p.price === null}
                  className={isCurrent ? "ui-btn mt-4 w-full" : "ui-btn-primary mt-4 w-full"}
                  style={isCurrent ? { color: "var(--brand)", background: "var(--brand-soft)" } : undefined}
                >
                  {isCurrent ? "Đang dùng" : busy === p.tier ? "Đang tạo…" : p.price === null ? "Liên hệ" : "Đăng ký"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {invoices.length > 0 && (
        <section className="ui-card mt-3 overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
              Hoá đơn gần đây
            </h2>
            <Link href={`/biz/${slug}/settings/invoices`} className="text-[12.5px] font-medium" style={{ color: "var(--brand)" }}>
              Xem tất cả
            </Link>
          </div>
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Nội dung</th>
                <th style={{ width: "20%" }}>Số tiền</th>
                <th style={{ width: "20%" }}>Trạng thái</th>
                <th style={{ width: "20%" }}>Ngày</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((iv) => (
                <tr key={iv.id}>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-700)" }}>
                    Gói {String(iv.detail.name ?? iv.detail.tier ?? "—")} · {String(iv.detail.months ?? "—")} tháng
                  </td>
                  <td className="text-[12.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
                    {money(iv.amount)}đ
                  </td>
                  <td>
                    <span className="ui-chip" style={iv.status === "paid" ? { background: "var(--ok-bg)", color: "var(--ok-ink)" } : { background: "var(--warn-bg)", color: "var(--warn-ink)" }}>
                      {iv.status === "paid" ? "Đã thanh toán" : "Chờ thanh toán"}
                    </span>
                  </td>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                    {new Date(iv.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
