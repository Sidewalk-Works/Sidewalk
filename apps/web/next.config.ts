import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// MapLibre 6 runs its tile decoding in a separate ES-module worker that the app must serve itself.
// Copying it into public/ (same origin) keeps it compatible with the Content-Security-Policy `worker-src 'self'`.
function publishMapWorker(): void {
  const from = path.dirname(require.resolve("maplibre-gl/package.json"));
  const to = path.resolve(process.cwd(), "public/vendor/maplibre");
  mkdirSync(to, { recursive: true });
  for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"])
    copyFileSync(path.join(from, "dist", file), path.join(to, file));
}
publishMapWorker();

// One .env at the repository root feeds the whole monorepo.
loadEnvConfig(path.resolve(process.cwd(), "../.."));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // End-to-end runs build into their own directory so they never disturb a running dev server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  transpilePackages: ["@sidewalk/contracts"],
  async headers() {
    const https = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Only over HTTPS; sending HSTS from a plain-HTTP origin is meaningless.
          ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : [])
          // The Content-Security-Policy is per request (it carries a nonce), so src/proxy.ts sets it.
        ]
      }
    ];
  }
};

export default nextConfig;
