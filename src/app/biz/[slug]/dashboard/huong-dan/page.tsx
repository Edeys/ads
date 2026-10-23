import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { GuideClient } from "./client";

export const dynamic = "force-dynamic";

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  return <GuideClient slug={slug} />;
}
