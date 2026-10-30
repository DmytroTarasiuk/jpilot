import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  // Cloudmersive's official Node client is generated as UMD. Keep it in the
  // server runtime so Turbopack does not interpret its AMD dependency names.
  serverExternalPackages: ["cloudmersive-virus-api-client"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withWorkflow(nextConfig);
