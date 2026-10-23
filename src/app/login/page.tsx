import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginClient } from "./login-client";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Đã đăng nhập rồi -> vào thẳng workspace (không để lại form login).
  const session = await auth();
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl && sp.callbackUrl.startsWith("/") ? sp.callbackUrl : "/biz";
  if (session?.user) redirect(callbackUrl);

  const chatGptEnabled = Boolean(process.env.OPENAI_CLIENT_ID && process.env.OPENAI_CLIENT_SECRET);

  return <LoginClient callbackUrl={callbackUrl} chatGptEnabled={chatGptEnabled} />;
}
