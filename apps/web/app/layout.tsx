import type { Metadata, Viewport } from "next";

import { AuthProvider } from "../lib/authContext";
import { getServerUser } from "../lib/serverAuth";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000"),
  title: {
    default: "Sidewalk",
    template: "%s | Sidewalk",
  },
  description: "Report, track, and follow civic issues in your neighborhood.",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialUser = await getServerUser();

  return (
    <html lang="en">
      <body>
        <AuthProvider initialUser={initialUser}>
          <main className="page">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
