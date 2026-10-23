// Vai trò & quyền — bảng quyền theo vai trò (owner toàn quyền; member theo tick).
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/guard";
import { PERMISSION_DOCS } from "@/lib/permissions";
import type { Permission } from "@/db/schema";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; perms: Permission[] }[] = [
  { title: "Vận hành quảng cáo", perms: ["ad_metrics.access", "metric_sync.access", "auto_pause.access", "quick_ads.access", "post_triggers.access", "publisher.access", "comments.access"] },
  { title: "Kết nối & dữ liệu", perms: ["credentials.access", "jobs.access", "bigquery.access", "events.access"] },
  { title: "AI & MCP", perms: ["mcp_keys.access", "mcp_server.access"] },
  { title: "Tài chính", perms: ["billing.view", "billing.manage", "budget_schedules.access"] },
  { title: "Tổ chức", perms: ["team.manage", "org.delete"] },
];

export default async function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4">
        <h1 className="ui-h1">Vai trò &amp; quyền</h1>
        <p className="ui-sub mt-1.5">
          Hai vai trò: <strong>Chủ Biz</strong> luôn có toàn quyền, <strong>Thành viên</strong> chỉ dùng được những quyền
          được tick khi mời hoặc khi cập nhật.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="ui-card ui-card-pad">
          <h2 className="ui-h2">Chủ Biz</h2>
          <p className="ui-sub mt-1">Toàn quyền, kể cả xoá Biz và chuyển giao.</p>
          <ul className="mt-2 space-y-1 text-[12.5px]" style={{ color: "var(--ink-600)" }}>
            <li>· Tất cả {Object.keys(PERMISSION_DOCS).length} quyền</li>
            <li>· Quản lý thành viên, lời mời, vai trò</li>
            <li>· Thanh toán, đổi gói, mua thêm hạn mức</li>
          </ul>
        </section>

        <section className="ui-card ui-card-pad">
          <h2 className="ui-h2">Thành viên</h2>
          <p className="ui-sub mt-1">Chỉ các quyền được cấp, không thấy phần tài chính nếu không cấp.</p>
          <ul className="mt-2 space-y-1 text-[12.5px]" style={{ color: "var(--ink-600)" }}>
            <li>· Mặc định: xem chỉ số + kéo chỉ số</li>
            <li>· Quyền nhạy cảm (thanh toán, xoá Biz) phải cấp riêng</li>
            <li>· Có thể thu hồi bất cứ lúc nào</li>
          </ul>
        </section>
      </div>

      <section className="ui-card mt-3 overflow-hidden p-0">
        <div className="px-5 py-3.5">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
            Danh mục quyền
          </h2>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
            {Object.keys(PERMISSION_DOCS).length} quyền, chia {GROUPS.length} nhóm.
          </p>
        </div>

        <table className="ui-table w-full">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>Quyền</th>
              <th>Mô tả</th>
              <th style={{ width: "12%" }} className="text-center">
                Chủ Biz
              </th>
              <th style={{ width: "12%" }} className="text-center">
                Thành viên
              </th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <Fragment key={g.title}>
                <tr>
                  <td colSpan={4} className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-400)", background: "var(--surface-3)" }}>
                    {g.title}
                  </td>
                </tr>
                {g.perms.map((p) => {
                  const doc = PERMISSION_DOCS[p];
                  return (
                    <tr key={p}>
                      <td className="text-[12.5px] font-medium" style={{ color: "var(--ink-800)" }}>
                        {doc.label}
                        {doc.sensitive && (
                          <span className="ml-1.5 text-[10.5px] font-semibold" style={{ color: "var(--danger-ink)" }}>
                            nhạy cảm
                          </span>
                        )}
                      </td>
                      <td className="text-[12px]" style={{ color: "var(--ink-500)" }}>
                        {doc.desc}
                      </td>
                      <td className="text-center" style={{ color: "var(--ok-ink)" }}>
                        ✓
                      </td>
                      <td className="text-center" style={{ color: "var(--ink-300)" }}>
                        tuỳ cấp
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
