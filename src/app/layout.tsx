import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Barlow_Condensed, Barlow_Semi_Condensed, Fira_Sans_Condensed, Fira_Sans_Extra_Condensed } from "next/font/google";
import "./globals.css";

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
};

// The app's screen: edge to edge (the HUD pads itself with the safe areas), and the
// page never zooms (the map has its own pinch zoom).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable} ${body.variable} ${displayCyr.variable} ${bodyCyr.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <div aria-hidden className="status-scrim" />
      </body>
    </html>
  );
}
