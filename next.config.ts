import type { NextConfig } from "next";
import { IMAGE_HOST } from "./src/lib/hotels/images";

const nextConfig: NextConfig = {
  // Minimal self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
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
