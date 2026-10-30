import { describe, expect, it } from "vitest";
import { deriveRunOutcome } from "./workflow-runs";

describe("search workflow connector isolation", () => {
  it("advances a partially successful run without pausing healthy sources", () => {
    expect(deriveRunOutcome({
      runnablePlatformCount: 2,
      succeededPlatformCount: 1,
      failedPlatformCount: 1,
    })).toEqual({
      status: "partially_completed",
      workflowStatus: "partially_completed",
      failureCode: "connector_failure",
      scheduleDisposition: "advance",
    });
  });

  it("pauses only when there is no runnable integration", () => {
    expect(deriveRunOutcome({
      runnablePlatformCount: 0,
      succeededPlatformCount: 0,
      failedPlatformCount: 0,
    })).toMatchObject({
      workflowStatus: "waiting_for_integration",
      scheduleDisposition: "pause",
    });
    expect(deriveRunOutcome({
      runnablePlatformCount: 1,
      succeededPlatformCount: 0,
      failedPlatformCount: 1,
    })).toMatchObject({
      status: "failed",
      failureCode: "connector_failure",
      scheduleDisposition: "advance",
    });
  });
});
