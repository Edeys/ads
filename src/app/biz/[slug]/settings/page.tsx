// Tổng quan cài đặt — tóm tắt Biz, thành viên, gói cước, hoá đơn.
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { PRICING } from "@/lib/pricing";
import { IconArrowRight, IconLayers, IconPlug, IconSparkle } from "../dashboard/icons";
import { DesktopUpdateSection } from "./desktop-update";

export const dynamic = "force-dynamic";

export default async function SettingsOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const base = `/biz/${slug}/settings`;

  const [memberCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.members)
    .where(eq(schema.members.bizId, m.biz.id));

  const [inviteCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.invites)
    .where(and(eq(schema.invites.bizId, m.biz.id), eq(schema.invites.status, "pending")));

  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.bizId, m.biz.id))
    .orderBy(desc(schema.plans.startedAt))
    .limit(1);

  const [invoice] = await db
    .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${schema.invoices.amount}),0)::bigint` })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.bizId, m.biz.id), eq(schema.invoices.status, "pending")));

  const tier = PRICING.find((p) => p.tier === (plan?.tier ?? "trial")) ?? PRICING[0];
  const daysLeft = plan?.expiresAt
    ? Math.max(0, Math.ceil((plan.expiresAt.getTime() - Date.now()) / 86_400_000))
    : null;

  const cards = [
    {
      title: "Thông tin Biz",
      desc: "Tên, slug, mã số thuế và địa chỉ xuất hoá đơn.",
      value: m.biz.name,
      href: `${base}/biz`,
      Icon: IconLayers,
      tint: "var(--brand-soft)",
      color: "var(--brand)",
    },
    {
      title: "Thành viên",
      desc: "Người có quyền truy cập Biz này và vai trò của họ.",
      value: `${memberCount?.n ?? 1} thành viên · ${inviteCount?.n ?? 0} lời mời chờ`,
      href: `${base}/members`,
      Icon: IconPlug,
      tint: "var(--ok-bg)",
      color: "var(--ok-ink)",
    },
    {
      title: "Gói cước",
      desc: "Hạn mức tài khoản quảng cáo, kết nối bán hàng, thành viên.",
      value: `${tier.name}${daysLeft !== null ? ` · còn ${daysLeft} ngày` : ""}`,
      href: `${base}/billing`,
      Icon: IconSparkle,
      tint: "var(--brand-soft)",
      color: "var(--brand)",
    },
    {
      title: "Hoá đơn",
      desc: "Các khoản chờ thanh toán và lịch sử giao dịch.",
      value: `${invoice?.n ?? 0} hoá đơn chờ · ${Number(invoice?.total ?? 0).toLocaleString("vi-VN")}đ`,
      href: `${base}/invoices`,
      Icon: IconLayers,
      tint: "var(--warn-bg)",
      color: "var(--warn-ink)",
    },
  ];

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-5">
        <h1 className="ui-h1">Tổng quan cài đặt</h1>
        <p className="ui-sub mt-1.5">
          Quản lý thông tin Biz, thành viên, quyền hạn và thanh toán ở một chỗ.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.Icon;
          return (
            <Link key={c.title} href={c.href} className="ui-card p-4 transition-colors hover:bg-[var(--surface-3)]">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: c.tint, color: c.color }}>
                  <Icon size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
                      {c.title}
                    </h2>
                    <IconArrowRight size={15} style={{ color: "var(--ink-300)" }} />
                  </div>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                    {c.desc}
                  </p>
                  <p className="mt-2 text-[13px] font-semibold" style={{ color: c.color }}>
                    {c.value}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <DesktopUpdateSection />

      <section className="ui-card ui-card-pad mt-3">
        <h2 className="ui-h2">Ứng dụng OAuth</h2>
        <p className="ui-sub mt-1">
          Khai App ID / Secret của Meta, TikTok, Google để nút “Kết nối nhanh” ở màn{" "}
          <b>Kết nối</b> tự kéo tài khoản quảng cáo và Pages về. Ở bản desktop, cấu hình được lưu ở{" "}
          <code className="rounded bg-[var(--surface-3)] px-1">%APPDATA%\\AdsSync\\oauth.env</code>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/biz/${slug}/settings/oauth`} className="ui-btn">
            Cấu hình ứng dụng
          </Link>
        </div>
      </section>

      <section className="ui-card ui-card-pad mt-3">
        <h2 className="ui-h2">Dữ liệu của bạn</h2>
        <p className="ui-sub mt-1">
          Bản self-hosted lưu toàn bộ dữ liệu trong thư mục <code className="rounded bg-[var(--surface-3)] px-1">.pgdata</code> trên
          máy này (bản desktop: <code className="rounded bg-[var(--surface-3)] px-1">%APPDATA%\\AdsSync</code>). Không có dữ liệu
          nào rời khỏi máy trừ khi bạn bật kết nối nền tảng quảng cáo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/biz/${slug}/dashboard/connections`} className="ui-btn">
            Quản lý kết nối
          </Link>
          <Link href={`/biz/${slug}/dashboard/activity`} className="ui-btn">
            Xem nhật ký thao tác
          </Link>
          {m.member.role === "owner" && (
            <a href={`/api/biz/${slug}/backup`} className="ui-btn-primary">
              Tải bản sao lưu (.tar.gz)
            </a>
          )}
        </div>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
          Bản sao lưu chứa cả thông tin kết nối đã mã hoá. Để khôi phục, đóng app rồi thay thư mục
          <code className="mx-1 rounded bg-[var(--surface-3)] px-1">pgdata</code>
          bằng dữ liệu trong file backup; cần giữ nguyên file
          <code className="mx-1 rounded bg-[var(--surface-3)] px-1">secret.txt</code>
          để giải mã token.
        </p>
      </section>
    </main>
  );
}
