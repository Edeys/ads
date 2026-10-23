import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { McpKeysClient } from "./client";

export const dynamic = "force-dynamic";

export default async function McpKeysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  return <McpKeysClient slug={slug} appUrl={process.env.APP_URL ?? "http://localhost:3000"} />;
}
