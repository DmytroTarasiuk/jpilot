import { describe, expect, it } from "vitest";
import { isPostingEligible, manualSearchWindow, scheduledSearchWindow } from "./search-window";

describe("scheduledSearchWindow", () => {
  it("uses the previous local calendar day", () => {
    const window = scheduledSearchWindow({
      scheduledAt: "2026-06-24T06:00:00Z",
      timezone: "Europe/Warsaw",
      cadence: "daily",
    });

    expect(window.start.toISOString()).toBe("2026-06-22T22:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-06-23T22:00:00.000Z");
  });

  it("produces a 23-hour calendar day across spring DST", () => {
    const window = scheduledSearchWindow({
      scheduledAt: "2026-03-30T06:00:00Z",
      timezone: "Europe/Warsaw",
      cadence: "daily",
    });

    expect(window.end.getTime() - window.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("produces a 25-hour calendar day across autumn DST", () => {
    const window = scheduledSearchWindow({
      scheduledAt: "2026-10-26T07:00:00Z",
      timezone: "Europe/Warsaw",
      cadence: "daily",
    });

    expect(window.end.getTime() - window.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

describe("manualSearchWindow", () => {
  it("rejects lookbacks beyond the seven-day product rule", () => {
    expect(() =>
      manualSearchWindow({ requestedAt: "2026-06-24T08:00:00Z", timezone: "Europe/Kyiv", lookbackDays: 8 }),
    ).toThrow(/1 through 7/);
  });
});

describe("isPostingEligible", () => {
  const window = {
    start: new Date("2026-06-23T00:00:00Z"),
    end: new Date("2026-06-24T00:00:00Z"),
  };

  it("requires a verified publication date inside the half-open window", () => {
    expect(
      isPostingEligible({
        publishedAt: new Date("2026-06-23T12:00:00Z"),
        publicationDateVerified: true,
        window,
        now: new Date("2026-06-24T12:00:00Z"),
      }),
    ).toBe(true);
    expect(
      isPostingEligible({
        publishedAt: new Date("2026-06-23T12:00:00Z"),
        publicationDateVerified: false,
        window,
        now: new Date("2026-06-24T12:00:00Z"),
      }),
    ).toBe(false);
    expect(
      isPostingEligible({
        publishedAt: window.end,
        publicationDateVerified: true,
        window,
        now: new Date("2026-06-24T12:00:00Z"),
      }),
    ).toBe(false);
  });
});
