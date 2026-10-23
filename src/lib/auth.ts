import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { provisionUser } from "./provision";
import OpenAI from "./auth-openai";

// Bản desktop chạy webview nên Google OAuth phải mở ở trình duyệt hệ thống
// (Google chặn user-agent webview) — phiên được chuyển sang webview qua bridge
// /api/auth/bridge → /api/desktop/auth-bridge.
//
// ChatGPT (OpenAI OAuth) là đường đăng nhập thứ hai, cho khách dùng gói
// ChatGPT subs vào thẳng hệ thống mà không cần tài khoản Google.
// Cả hai provider đều chỉ xác thực danh tính; quyền ghi vào hệ thống vẫn do
// Approval Gate kiểm soát.
const providers: any[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }),
];

// Chỉ bật provider ChatGPT khi đã cấu hình client id/secret.
if (process.env.OPENAI_CLIENT_ID && process.env.OPENAI_CLIENT_SECRET) {
  providers.push(
    OpenAI({
      clientId: process.env.OPENAI_CLIENT_ID,
      clientSecret: process.env.OPENAI_CLIENT_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, profile }) {
      // Luôn provision theo email: với OAuth, user.id là id của nhà cung cấp
      // (không phải id trong DB của ta) nên phải tra cứu/tạo user nội bộ.
      const email = user.email ?? (profile as any)?.email;
      if (!email) return false;
      const row = await provisionUser(email, user.name, user.image);
      (user as any).id = row.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session.user as any).id = token.uid;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
