import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GithubFound · GitHub 寻宝",
  description:
    "发现 GitHub 每日/每周/每月热门项目，按语言和分类筛选，AI 中文总结 + 风向标 + 魔法棒搜索重写，多模型一键切换。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "apple-touch-icon-precomposed", url: "/apple-touch-icon.png" },
    ],
  },
  openGraph: {
    title: "GithubFound · GitHub 寻宝",
    description:
      "发现 GitHub 每日热门项目，AI 中文总结 · 风向分析 · 魔法棒智能搜索，Agnes/千问/DeepSeek 多模型一键切换。",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "GithubFound Logo" }],
  },
  twitter: {
    card: "summary",
    title: "GithubFound · GitHub 寻宝",
    description: "GitHub 热门项目发现 + AI 中文总结 + 开源风向标",
    images: ["/icon-512.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-100">
        <TopNav />
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
