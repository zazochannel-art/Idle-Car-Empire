import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Barlow_Condensed, Barlow_Semi_Condensed, Fira_Sans_Condensed, Fira_Sans_Extra_Condensed } from "next/font/google";
import "./globals.css";

const base = process.env.PAGES_BASE_PATH ?? "";

// racing-game lettering: narrow, heavy, slanted headings over a narrow body
// face (self-hosted at build time). Barlow has no Cyrillic, so Fira's
// condensed cuts fill in those letters for Russian.
const display = Barlow_Condensed({ subsets: ["latin", "latin-ext"], weight: ["700", "800", "900"], style: ["normal", "italic"], variable: "--font-barlow-c", display: "swap" });
const body = Barlow_Semi_Condensed({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700", "800"], variable: "--font-barlow-sc", display: "swap" });
const displayCyr = Fira_Sans_Extra_Condensed({ subsets: ["cyrillic"], weight: ["700", "800", "900"], style: ["normal", "italic"], variable: "--font-fira-xc", display: "swap" });
const bodyCyr = Fira_Sans_Condensed({ subsets: ["cyrillic"], weight: ["500", "600", "700", "800"], variable: "--font-fira-c", display: "swap" });

export const metadata: Metadata = {
  title: "Idle Car Empire",
  description: "Build a global car empire — from a tiny garage to hypercars and future cars.",
  applicationName: "Idle Car Empire",
  appleWebApp: { capable: true, title: "Car Empire", statusBarStyle: "black" },
  // metadata icons are not prefixed with basePath, so add it here
  icons: { icon: `${base}/icon-192.png`, apple: `${base}/apple-touch-icon.png` },
};

export const viewport: Viewport = {
  themeColor: "#2b2b2e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable} ${body.variable} ${displayCyr.variable} ${bodyCyr.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
