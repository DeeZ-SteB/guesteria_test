import type { NextConfig } from "next";
import { IMAGE_HOST } from "./src/lib/hotels/images";
import { buildCsp } from "./src/lib/csp";

const nextConfig: NextConfig = {
  // Minimal self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // Security headers for every route; the CSP rationale is in src/lib/csp.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: buildCsp({ dev: process.env.NODE_ENV === "development", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Offer tokens live in /checkout URLs: other sites only ever see our origin.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HTTPS only for a year (Vercel adds this on its domains; the Docker image needs it too).
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
      // Personal, price-bearing pages: never cached by browsers or CDNs, never indexed.
      ...["/checkout", "/account", "/account/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      })),
    ];
  },
  images: {
    // Only LiteAPI's photo CDN, https only: the optimizer must not become an open proxy.
    remotePatterns: [{ protocol: "https", hostname: IMAGE_HOST, port: "", pathname: "/**" }],
    qualities: [75],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
