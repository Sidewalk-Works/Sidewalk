import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

/** Public reports are meant to be found. Private areas and the API are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/dashboard", "/account", "/report", "/login", "/register", "/api/"]
      }
    ],
    host: SITE_URL
  };
}
