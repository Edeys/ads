// Provider OpenAI (ChatGPT) cho NextAuth.
//
// ChatGPT dùng OAuth riêng của OpenAI (không phải API key):
//   Authorize: https://auth.openai.com/oauth/authorize
//   Token:     https://auth.openai.com/oauth/token
//   Userinfo:  https://api.openai.com/v1/user
//
// Khách hàng đăng nhập bằng tài khoản ChatGPT (có gói subs) để vào thẳng
// hệ thống. Token này KHÔNG dùng để gọi API OpenAI trả tiền — nó chỉ xác
// thực danh tính. Muốn AI chạy trong hệ thống thì dùng connection OpenAI
// riêng (khoá API của khách).
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";
import { fetchT } from "./http";

export interface OpenAIConfig extends OAuthUserConfig<OpenAIProfile> {}

export interface OpenAIProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const USERINFO_URL = "https://api.openai.com/v1/user";

export default function OpenAI(options: OpenAIConfig): OAuthConfig<OpenAIProfile> {
  return {
    id: "openai",
    name: "ChatGPT",
    type: "oauth",
    authorization: {
      url: AUTHORIZE_URL,
      params: {
        scope: "openid profile email offline_access",
        response_type: "code",
      },
    },
    token: TOKEN_URL,
    userinfo: {
      url: USERINFO_URL,
      async request({ tokens }: { tokens: Record<string, unknown> }) {
        const res = await fetchT(USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token as string}` },
        });
        if (!res.ok) throw new Error("Không đọc được thông tin tài khoản ChatGPT");
        return (await res.json()) as OpenAIProfile;
      },
    },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name ?? null,
        email: profile.email ?? null,
        image: profile.picture ?? null,
      };
    },
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    checks: ["state"],
  };
}
