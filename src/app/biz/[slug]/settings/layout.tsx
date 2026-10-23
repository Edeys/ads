import { DashboardHeader } from "../dashboard/header";
import { HelpRail } from "../dashboard/help-rail";
import { loadShellData } from "@/lib/shell-data";
import { SettingsNav } from "./settings-nav";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shell = await loadShellData(slug);

  return (
    <div className="min-h-screen">
      <DashboardHeader
        currentSlug={slug}
        currentBizName={shell.currentBizName}
        userBizs={shell.userBizs}
        userEmail={shell.userEmail}
        userName={shell.userName}
      />
      <div className="flex">
        <SettingsNav slug={slug} />
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0 lg:pr-[14px]">{children}</div>
      </div>
      <HelpRail slug={slug} />
    </div>
  );
}
