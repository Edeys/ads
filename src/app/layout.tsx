import "./globals.css";
import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";

const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-app",
});

export const metadata: Metadata = { title: "AdsSync Local", description: "Local AI ads autopilot" };

// Chạy trước khi paint để không nháy trắng khi mở app ở chế độ tối.
const themeScript = `(function(){try{var t=localStorage.getItem("adsync.theme");if(t!=="dark"&&t!=="light"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen text-[var(--ink-900)]" style={{ fontFamily: "var(--font-app), ui-sans-serif, system-ui" }}>
        {children}
      </body>
    </html>
  );
}
