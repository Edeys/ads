// Cài đặt > Ứng dụng OAuth — nơi khai App ID / Secret của Meta, TikTok, Google.
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/guard";
import {
  OAUTH_CONFIG_FIELDS,
  PROVIDER_LABELS,
  type ConfigProvider,
  canWriteConfig,
  configFile,
  currentAppUrl,
  currentValues,
  maskValue,
  redirectUri,
} from "@/lib/self-hosted-config";
import { OAuthConfigClient } from "./client";

export const dynamic = "force-dynamic";

const PROVIDERS: ConfigProvider[] = ["meta", "tiktok", "google"];

export default async function OAuthSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  if (m.member.role !== "owner") redirect(`/biz/${slug}/settings`);

  const values = currentValues();

  return (
    <OAuthConfigClient
      appUrl={currentAppUrl()}
      configFile={configFile()}
      canWrite={canWriteConfig()}
      providers={PROVIDERS.map((p) => ({
        id: p,
        label: PROVIDER_LABELS[p],
        redirectUri: redirectUri(p),
        appId: p === "meta" ? values.META_APP_ID ?? null : null,
      }))}
      fields={OAUTH_CONFIG_FIELDS.map((f) => ({
        key: f.key,
        label: f.label,
        provider: f.provider,
        secret: f.secret,
        hint: f.hint ?? null,
        set: Boolean(values[f.key]),
        masked: maskValue(values[f.key]),
      }))}
    />
  );
}
