import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is "use client" against live Convex queries — nothing
  // benefits from static prerendering, so Cache Components (which flags
  // dynamic params/data as blocking prerendering) just adds dev-mode noise.
  agentRules: false,
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
