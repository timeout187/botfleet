import type { NextConfig } from "next";

// script-src allows 'unsafe-eval' only in development, where Next.js's Fast
// Refresh relies on eval()'d chunks. Production builds never need it.
const CSP = [
  "default-src 'self'",
  `script-src 'self'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.discordapp.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // pm2 and dockerode both do dynamic requires (native bindings, a bundled
  // terminal UI) that break when webpack/turbopack tries to statically
  // bundle them into a route handler - keep them as real Node requires.
  serverExternalPackages: ["pm2", "dockerode"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
