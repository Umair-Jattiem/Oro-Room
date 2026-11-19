import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* let phones and tablets on the same Wi-Fi open the dev site by this PC's network address (development only) */
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
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
