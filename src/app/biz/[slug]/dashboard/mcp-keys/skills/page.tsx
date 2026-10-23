import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { SkillsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SkillsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  return <SkillsClient slug={slug} />;
}
