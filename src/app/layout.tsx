import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/shell/header";
import { Footer } from "@/components/shell/footer";
import { TabBar, TabBarFallback } from "@/components/shell/tab-bar";
import { AssistantFab } from "@/components/shell/assistant-fab";
import { AuthModalProvider } from "@/features/auth/auth-modal";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: "Guesteria Stay", template: "%s · Guesteria Stay" },
  description: "Бронювання готелів з AI-асистентом для вашої поїздки",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <AuthModalProvider>
          <Header />
          <main className="flex-1 pb-[calc(var(--gs-tabbar-height)+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
          <Footer />
          <Suspense fallback={<TabBarFallback />}>
            <TabBar />
          </Suspense>
          <AssistantFab />
        </AuthModalProvider>
      </body>
    </html>
  );
}
