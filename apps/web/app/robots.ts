import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/settings", "/profile", "/reports/new", "/cases", "/api/"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
