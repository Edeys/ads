// Bản auth nhẹ cho middleware (Edge runtime): chỉ verify JWT session, không touch DB.
// signIn provisioning nằm ở auth.ts (route handlers, nodejs runtime).
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (token.uid) (session.user as any).id = token.uid;
      return session;
    },
  },
});
