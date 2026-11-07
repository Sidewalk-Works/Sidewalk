import type { Metadata } from "next";

import { AuthProvider } from "../lib/authContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sidewalk",
  description: "Sidewalk authentication"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <main className="page">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
