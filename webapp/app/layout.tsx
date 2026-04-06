import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SidebarNav } from "./components/SidebarNav";
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
  title: "troy-vault",
  description: "Local-first personal media vault by Infima Foundation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex bg-[#0a0a0a] text-white">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 flex flex-col bg-[#0a0a0a] border-r border-white/8 py-6">
          {/* Logo */}
          <div className="px-5 mb-8">
            <span className="text-xs font-semibold tracking-widest uppercase text-white/30">
              troy-vault
            </span>
          </div>

          {/* Nav — client component for active highlighting */}
          <SidebarNav />

          {/* Footer */}
          <div className="px-5 mt-6">
            <span className="text-xs text-white/15">Infima Foundation</span>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
