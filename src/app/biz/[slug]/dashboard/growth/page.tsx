// Xem trước dữ liệu tăng trưởng — preview số liệu thật từ mọi nguồn đã kết nối.
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/guard";
import { GrowthClient } from "./client";

export const dynamic = "force-dynamic";

export default async function GrowthPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  return <GrowthClient slug={slug} />;
}
