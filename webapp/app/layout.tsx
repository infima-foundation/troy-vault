import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "./components/Sidebar";
import { UploadProvider } from "./components/UploadProvider";
import { SentryErrorBoundary } from "./components/SentryErrorBoundary";
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
  title: "TROY",
  description: "Local-first personal media vault by Infima Foundation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full flex bg-gray-50 text-gray-900 antialiased">
        <SentryErrorBoundary>
          <UploadProvider>
            <Sidebar />
            <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
          </UploadProvider>
        </SentryErrorBoundary>
      </body>
    </html>
  );
}
