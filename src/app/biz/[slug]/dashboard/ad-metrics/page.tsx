import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { AdMetricsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function AdMetricsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  const canManage = isOwner || perms.includes("ad_metrics.access");

  return <AdMetricsClient slug={slug} canManage={canManage} />;
}
