import { describe, expect, it } from "vitest";
import { nextScheduleOccurrence, scheduleInputSchema } from "./schedule";

describe("nextScheduleOccurrence", () => {
  it("selects tomorrow when today's daily time has passed", () => {
    expect(
      nextScheduleOccurrence({
        now: "2026-06-23T07:00:00Z",
        timezone: "Europe/Warsaw",
        localTime: "08:00",
        cadence: "daily",
        dayOfWeek: null,
      }).toISOString(),
    ).toBe("2026-06-24T06:00:00.000Z");
  });

  it("selects the requested weekly weekday", () => {
    expect(
      nextScheduleOccurrence({
        now: "2026-06-23T05:00:00Z",
        timezone: "Europe/Warsaw",
        localTime: "08:00",
        cadence: "weekly",
        dayOfWeek: 3,
      }).toISOString(),
    ).toBe("2026-06-24T06:00:00.000Z");
  });
});

describe("scheduleInputSchema", () => {
  it("does not allow auto-apply to exceed the search limit", () => {
    const result = scheduleInputSchema.safeParse({
      requestId: "53e4fe52-c06e-47a3-b659-f18223f68055",
      name: "Daily search",
      cadence: "daily",
      timezone: "Europe/Warsaw",
      localTime: "08:00",
      dayOfWeek: null,
      targetCountries: ["PL"],
      platforms: [{ platform: "linkedin", searchLimit: 10, autoApplyLimit: 11 }],
    });
    expect(result.success).toBe(false);
  });
});
