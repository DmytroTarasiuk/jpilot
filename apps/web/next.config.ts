import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // Cloudmersive's official Node client is generated as UMD. Keep it in the
  // server runtime so Turbopack does not interpret its AMD dependency names.
  serverExternalPackages: ["cloudmersive-virus-api-client"],
};

export default withWorkflow(nextConfig);
