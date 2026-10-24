import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron";

describe("cron request authorization", () => {
  it("accepts the exact bearer secret", () => {
    const request = new Request("https://jobpilot.example/api/cron/dispatch", {
      headers: { authorization: "Bearer a-high-entropy-secret" },
    });

    expect(isAuthorizedCronRequest(request, "a-high-entropy-secret")).toBe(true);
  });

  it("rejects missing and mismatched credentials", () => {
    const missing = new Request("https://jobpilot.example/api/cron/dispatch");
    const mismatched = new Request("https://jobpilot.example/api/cron/dispatch", {
      headers: { authorization: "Bearer wrong" },
    });

    expect(isAuthorizedCronRequest(missing, "a-high-entropy-secret")).toBe(false);
    expect(isAuthorizedCronRequest(mismatched, "a-high-entropy-secret")).toBe(false);
    expect(isAuthorizedCronRequest(missing, undefined)).toBe(false);
  });
});
