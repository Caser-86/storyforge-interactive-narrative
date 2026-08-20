import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoryForge 故事工作台",
  description:
    "面向私人创作的互动叙事项目工作台：从项目简报、故事结构到节点编辑，逐步完成一部可回溯的作品。",
  keywords: [
    "互动叙事",
    "故事编辑器",
    "项目库",
    "互动小说",
  ],
  openGraph: {
    title: "StoryForge",
    description: "从项目简报开始，逐步完成一部互动叙事作品",
    type: "website",
    locale: "zh_CN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f2eee7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
