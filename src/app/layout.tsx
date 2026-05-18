import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StoryForge - LLM 驱动的互动叙事生成器",
  description:
    "输入一句话灵感，AI 在 5 秒内生成可玩的互动文字冒险。支持赛博朋克、奇幻、恐怖等多种风格，每个选择都将改变故事走向。",
  keywords: [
    "互动叙事",
    "文字冒险",
    "AI 生成",
    "LLM 游戏",
    "互动小说",
  ],
  openGraph: {
    title: "StoryForge",
    description: "输入一句话灵感，5 秒内开始你的互动冒险",
    type: "website",
    locale: "zh_CN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0a0a1a] text-white">
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
