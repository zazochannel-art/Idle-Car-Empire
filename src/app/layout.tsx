import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Nunito } from "next/font/google";
import "./globals.css";

const base = process.env.PAGES_BASE_PATH ?? "";

// rounded, chunky letters: the friendly idle-game look (self-hosted at build time)
const nunito = Nunito({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800", "900"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: "Idle Car Empire",
  description: "Build a global car empire — from a tiny garage to hypercars and future cars.",
  applicationName: "Idle Car Empire",
  appleWebApp: { capable: true, title: "Car Empire", statusBarStyle: "black-translucent" },
  // metadata icons are not prefixed with basePath, so add it here
  icons: { icon: `${base}/icon-192.png`, apple: `${base}/apple-touch-icon.png` },
};

export const viewport: Viewport = {
  themeColor: "#141a3f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
