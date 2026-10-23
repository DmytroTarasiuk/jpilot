import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { fileURLToPath } from "node:url";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {};
const eveRoot = fileURLToPath(new URL("../..", import.meta.url));
const withEveConfig = withEve(nextConfig, { eveRoot });

export default withWorkflow(async (phase, context) => withEveConfig(phase, context));
