import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("scheduled dispatcher workflow", () => {
  it("posts to the configured JobPilot cron URL with bearer authentication", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/dispatch-schedules.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("--request POST");
    expect(workflow).toContain('--header "Authorization: Bearer $CRON_SECRET"');
    expect(workflow).toContain('"$JOBPILOT_CRON_URL"');
    expect(workflow).not.toMatch(/\$CRON_URL\b/);
  });
});
