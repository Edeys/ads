// Hoá đơn — toàn bộ giao dịch của Biz (chờ thanh toán / đã thanh toán / huỷ).
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; style: React.CSSProperties }> = {
  pending: { label: "Chờ thanh toán", style: { background: "var(--warn-bg)", color: "var(--warn-ink)" } },
  paid: { label: "Đã thanh toán", style: { background: "var(--ok-bg)", color: "var(--ok-ink)" } },
  cancelled: { label: "Đã huỷ", style: { background: "var(--surface-3)", color: "var(--ink-500)" } },
};

export default async function InvoicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const rows = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.bizId, m.biz.id))
    .orderBy(desc(schema.invoices.createdAt));

  const total = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0);
  const pending = rows.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.amount), 0);

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">Hoá đơn</h1>
          <p className="ui-sub mt-1.5">
            {rows.length} giao dịch · đã thanh toán {total.toLocaleString("vi-VN")}đ · chờ thanh toán{" "}
            {pending.toLocaleString("vi-VN")}đ
          </p>
        </div>
        <Link href={`/biz/${slug}/settings/billing`} className="ui-btn-primary" style={{ height: 36 }}>
          Mua gói / hạn mức
        </Link>
      </div>

      <section className="ui-card overflow-hidden p-0">
        <table className="ui-table w-full">
          <thead>
            <tr>
              <th style={{ width: "34%" }}>Nội dung</th>
              <th style={{ width: "16%" }}>Số tiền</th>
              <th style={{ width: "16%" }}>Trạng thái</th>
              <th style={{ width: "18%" }}>Ngày tạo</th>
              <th style={{ width: "16%" }}>Mã</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  Chưa có hoá đơn nào. Đăng ký gói để bắt đầu.
                </td>
              </tr>
            ) : (
              rows.map((iv) => (
                <tr key={iv.id}>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-700)" }}>
                    Gói {String((iv.detail as Record<string, unknown>).name ?? (iv.detail as Record<string, unknown>).tier ?? "—")} ·{" "}
                    {String((iv.detail as Record<string, unknown>).months ?? "—")} tháng
                  </td>
                  <td className="text-[12.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
                    {Number(iv.amount).toLocaleString("vi-VN")}đ
                  </td>
                  <td>
                    <span className="ui-chip" style={STATUS[iv.status]?.style}>
                      {STATUS[iv.status]?.label ?? iv.status}
                    </span>
                  </td>
                  <td className="text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                    {iv.createdAt.toLocaleString("vi-VN")}
                  </td>
                  <td className="font-mono text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                    {iv.id.slice(0, 8)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
