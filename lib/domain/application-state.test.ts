import { describe, expect, it } from "vitest";
import { assertApplicationTransition, canTransitionApplication } from "./application-state";

describe("application state machine", () => {
  it("supports the approval path", () => {
    expect(canTransitionApplication("proposed", "approval_required")).toBe(true);
    expect(canTransitionApplication("approval_required", "approved")).toBe(true);
    expect(canTransitionApplication("approved", "applying")).toBe(true);
    expect(canTransitionApplication("applying", "submitted")).toBe(true);
  });

  it("prevents direct or repeated submission", () => {
    expect(() => assertApplicationTransition("proposed", "submitted")).toThrow(/Invalid/);
    expect(() => assertApplicationTransition("submitted", "submitted")).toThrow(/Invalid/);
  });

  it("allows failed direct submission to fall back to a manual task", () => {
    expect(canTransitionApplication("failed", "manual_required")).toBe(true);
  });
});
