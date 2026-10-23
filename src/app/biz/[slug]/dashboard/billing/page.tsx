import { redirect } from "next/navigation";

export default async function LegacyBillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/biz/${slug}/settings/billing`);
}
