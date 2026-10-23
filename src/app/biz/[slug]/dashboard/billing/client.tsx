"use client";

import { useState } from "react";

export type PlanData = {
  tier: string;
  quota: { tkqc: number; qlbh: number; staff: number; minSyncMinutes: number };
  startedAt: string;
  expiresAt: string | null;
  status: string;
};

export type UsageData = {
  tkqc: number;
  qlbh: number;
  staff: number;
};

export type InvoiceRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

const TIERS = [
  {
    id: "small",
    name: "Small",
    monthlyPrice: 499_000,
    tkqc: 3,
    qlbh: 1,
    staff: 2,
    minSync: 30,
    desc: "Phù hợp cho cá nhân kinh doanh hoặc đội ngũ nhỏ",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 999_000,
    tkqc: 10,
    qlbh: 3,
    staff: 5,
    minSync: 10,
    popular: true,
    desc: "Lựa chọn phổ biến cho các shop online và agency",
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 1_999_000,
    tkqc: 30,
    qlbh: 10,
    staff: 20,
    minSync: 10,
    desc: "Dành cho doanh nghiệp quy mô lớn chạy nhiều ads",
  },
  {
    id: "custom",
    name: "Tuỳ chỉnh",
    monthlyPrice: 0,
    tkqc: 999,
    qlbh: 999,
    staff: 999,
    minSync: 5,
    desc: "Hạn mức không giới hạn và hỗ trợ riêng 1-1",
  },
];

const TERMS = [
  { months: 3, discount: 0, label: "3 tháng" },
  { months: 6, discount: 5, label: "6 tháng (-5%)" },
  { months: 12, discount: 10, label: "12 tháng (-10%)" },
  { months: 24, discount: 25, label: "24 tháng (-25%)" },
];

export function BillingClient({
  slug,
  isSelfHosted,
  plan,
  usage,
  invoices,
}: {
  slug: string;
  isSelfHosted: boolean;
  plan: PlanData;
  usage: UsageData;
  invoices: InvoiceRow[];
}) {
  const [selectedTerm, setSelectedTerm] = useState(12);

  const termObj = TERMS.find((t) => t.months === selectedTerm) ?? TERMS[2];

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="ui-h1">Gói cước & Hạn mức</h1>
          <p className="ui-sub mt-1">Quản lý hạn mức sử dụng và đăng ký gói nâng cấp</p>
        </div>
      </div>

      {isSelfHosted && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-800">
          <div className="flex items-center gap-2 font-semibold">
            <span>✨ Chế độ Self-Hosted (Bản tự lưu trữ cục bộ)</span>
          </div>
          <p className="mt-1 text-xs text-blue-700">
            Hệ thống đang chạy trên máy chủ nội bộ của bạn. Mọi tính năng, kết nối, tự động hoá và hạn mức đều không bị giới hạn và hoàn toàn miễn phí.
          </p>
        </div>
      )}

      {/* Quota cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-[var(--card)] p-4 shadow-sm">
          <div className="text-xs text-zinc-500">Tài khoản quảng cáo</div>
          <div className="mt-1 text-2xl font-bold text-zinc-900">
            {usage.tkqc}{" "}
            <span className="text-sm font-normal text-zinc-400">
              / {isSelfHosted ? "∞" : plan.quota.tkqc}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">Meta, TikTok, Google Ads</div>
        </div>

        <div className="rounded-xl border bg-[var(--card)] p-4 shadow-sm">
          <div className="text-xs text-zinc-500">Kết nối QLBH</div>
          <div className="mt-1 text-2xl font-bold text-zinc-900">
            {usage.qlbh}{" "}
            <span className="text-sm font-normal text-zinc-400">
              / {isSelfHosted ? "∞" : plan.quota.qlbh}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">Pancake, Nhanh.vn, Sapo</div>
        </div>

        <div className="rounded-xl border bg-[var(--card)] p-4 shadow-sm">
          <div className="text-xs text-zinc-500">Nhân sự / Thành viên</div>
          <div className="mt-1 text-2xl font-bold text-zinc-900">
            {usage.staff}{" "}
            <span className="text-sm font-normal text-zinc-400">
              / {isSelfHosted ? "∞" : plan.quota.staff}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">Thành viên trong Biz</div>
        </div>

        <div className="rounded-xl border bg-[var(--card)] p-4 shadow-sm">
          <div className="text-xs text-zinc-500">Tần suất sync nhanh nhất</div>
          <div className="mt-1 text-2xl font-bold text-zinc-900">
            {isSelfHosted ? "10 phút" : `${plan.quota.minSyncMinutes} phút`}
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">Chu kỳ chạy worker</div>
        </div>
      </div>

      {/* Plan tiers */}
      <div className="mb-6">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Các gói dịch vụ</h2>
            <p className="text-xs text-zinc-500">Tất cả các gói đều bao gồm đồng bộ Google Sheets, AI Autopilot, Telegram Alert & MCP Server</p>
          </div>

          <div className="flex rounded-lg border bg-zinc-100 p-1 text-xs">
            {TERMS.map((term) => (
              <button
                key={term.months}
                onClick={() => setSelectedTerm(term.months)}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  selectedTerm === term.months ? "bg-[var(--card)] text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {term.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {TIERS.map((tier) => {
            const isCur = plan.tier === tier.id;
            const discountedMonthly = Math.round(tier.monthlyPrice * (1 - termObj.discount / 100));
            return (
              <div
                key={tier.id}
                className={`flex flex-col justify-between rounded-xl border p-5 ${
                  tier.popular ? "border-blue-500 bg-[var(--card)] shadow-md ring-1 ring-blue-500" : "bg-[var(--card)] shadow-sm"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 text-lg">{tier.name}</span>
                    {tier.popular && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        PHỔ BIẾN
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{tier.desc}</div>

                  <div className="my-4">
                    {tier.monthlyPrice > 0 ? (
                      <div>
                        <span className="text-2xl font-extrabold text-zinc-900">
                          {discountedMonthly.toLocaleString("vi-VN")}₫
                        </span>
                        <span className="text-xs text-zinc-500"> / tháng</span>
                        {termObj.discount > 0 && (
                          <div className="text-[11px] text-zinc-400 line-through">
                            {tier.monthlyPrice.toLocaleString("vi-VN")}₫ / tháng
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-2xl font-extrabold text-zinc-900">Liên hệ</div>
                    )}
                  </div>

                  <ul className="space-y-2 border-t pt-4 text-xs text-zinc-600">
                    <li className="flex items-center gap-1.5">
                      <span className="text-blue-600 font-bold">✓</span> {tier.tkqc} tài khoản quảng cáo
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-blue-600 font-bold">✓</span> {tier.qlbh} kết nối QLBH (Pancake/Nhanh)
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-blue-600 font-bold">✓</span> {tier.staff} nhân viên quản trị
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-blue-600 font-bold">✓</span> Tần suất đồng bộ {tier.minSync} phút
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-blue-600 font-bold">✓</span> Kết nối AI LLM & Claude Desktop MCP
                    </li>
                  </ul>
                </div>

                <div className="mt-6">
                  {isCur ? (
                    <button disabled className="w-full rounded-lg border bg-zinc-100 py-2 text-xs font-semibold text-zinc-500">
                      Gói hiện tại
                    </button>
                  ) : (
                    <button
                      onClick={() => alert(`Đăng ký gói ${tier.name} (${termObj.label})`)}
                      className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      {isSelfHosted ? "Chọn gói (Demo)" : "Đăng ký ngay"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoices */}
      <div className="mt-8 rounded-xl border bg-[var(--card)] p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold">Lịch sử hoá đơn thanh toán</h3>
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-xs text-zinc-400">
            Chưa có hoá đơn nào được phát sinh.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="p-3">Mã hoá đơn</th>
                  <th className="p-3">Số tiền</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="p-3 font-mono">{inv.id.slice(0, 8)}...</td>
                    <td className="p-3 font-semibold">{inv.amount.toLocaleString("vi-VN")} {inv.currency}</td>
                    <td className="p-3">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-500">{new Date(inv.createdAt).toLocaleDateString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
