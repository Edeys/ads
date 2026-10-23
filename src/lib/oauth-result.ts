// URL kết thúc luồng OAuth.
//
// Bản desktop mở OAuth trong trình duyệt hệ thống — trình duyệt này không có
// phiên đăng nhập của WebView, nên không thể redirect về /biz/... (sẽ bị đẩy ra
// /login). Vì vậy bản self-hosted redirect về trang công khai /connect/result để
// báo thành công/thất bại và hướng dẫn quay lại cửa sổ app.
export type OAuthResultProvider = "meta" | "google" | "tiktok";

export function oauthResultUrl(opts: {
  appUrl: string;
  provider: OAuthResultProvider;
  status: "ok" | "error";
  slug?: string | null;
  successLabel?: string;
  error?: string;
  code?: string;
  msg?: string;
}): string {
  const { appUrl, provider, status, slug, successLabel, error, code, msg } = opts;

  if (process.env.SELF_HOSTED === "true") {
    const q = new URLSearchParams({ provider, status });
    if (slug) q.set("slug", slug);
    if (msg) q.set("message", msg);
    if (code) q.set("code", code);
    return `${appUrl}/connect/result?${q.toString()}`;
  }

  if (status === "ok") {
    return slug
      ? `${appUrl}/biz/${slug}/dashboard/connections?success=${encodeURIComponent(successLabel ?? provider)}`
      : `${appUrl}/biz`;
  }
  return slug
    ? `${appUrl}/biz/${slug}/dashboard/connections?error=${encodeURIComponent(error ?? provider)}&code=${encodeURIComponent(code ?? "")}&msg=${encodeURIComponent(msg ?? "")}`
    : `${appUrl}/login?error=${encodeURIComponent(error ?? provider)}`;
}
