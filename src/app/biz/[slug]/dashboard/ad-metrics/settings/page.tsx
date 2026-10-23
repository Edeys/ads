import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { AdMetricsSettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function AdMetricsSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  if (!isOwner && !perms.includes("ad_metrics.access")) {
    return (
      <main className="px-[18px] pb-10 pt-6">
        <h1 className="text-xl font-semibold">Không có quyền</h1>
        <p className="ui-sub mt-2">Cần quyền Chỉ số quảng cáo để đổi cấu hình bảng.</p>
      </main>
    );
  }

  return <AdMetricsSettingsClient slug={slug} />;
}
