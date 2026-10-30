import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((path) => !path.endsWith("pnpm-lock.yaml") && path !== "scripts/scan-secrets.mjs");

const markers = [
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Stripe secret key", /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/g],
];
const privateKeyMarker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
const findings = [];

for (const path of trackedFiles) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  if (content.includes(privateKeyMarker)) findings.push({ path, label: "Private key" });
  for (const [label, pattern] of markers) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push({ path, label });
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY)[A-Z0-9_]*\s*=\s*["']?([^\s"'#]{12,})/);
    if (!match) continue;
    const value = match[1].toLowerCase();
    if (/^(placeholder|example|changeme|your[_-])/.test(value) || value.includes("${")) continue;
    findings.push({ path, label: "Credential-like environment assignment" });
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found in tracked files:");
  for (const finding of findings) console.error(`- ${finding.path}: ${finding.label}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${trackedFiles.length} tracked files checked).`);
}
