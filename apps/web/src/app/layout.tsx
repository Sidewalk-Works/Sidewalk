import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { VerifyBanner } from "@/components/layout/verify-banner";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap"
});
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Sidewalk: report it, track it, see it fixed", template: "%s · Sidewalk" },
  description:
    "Report problems in your community, follow what happens next, and keep a public record of what was claimed and what was verified.",
  openGraph: { siteName: "Sidewalk", type: "website", locale: "en_NG" }
};

export const viewport: Viewport = { themeColor: "#f7f4ec", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:bg-ink focus:px-4 focus:py-3 focus:font-semibold focus:text-paper"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <VerifyBanner />
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
