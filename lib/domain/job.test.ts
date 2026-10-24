import { describe, expect, it } from "vitest";
import { canonicalizeJobUrl, normalizeVacancy, scoreVacancy } from "./job";

const source = {
  platform: "djinni" as const,
  externalId: "845514",
  sourceUrl: "http://DJINNI.co/jobs/845514-role/?utm_source=feed&gclid=tracking",
  countryCode: "PL" as const,
  title: "Senior TypeScript Software Engineer",
  descriptionHtml: "<p>Remote work with TypeScript, Node.js, PostgreSQL and AWS.</p>",
  publishedAt: "2026-10-24T10:00:00.000Z",
  categories: ["TypeScript", "Node.js"],
  sourcePayload: { guid: "845514" },
};

describe("job normalization and deterministic matching", () => {
  it("canonicalizes URLs and produces stable normalized content", () => {
    expect(canonicalizeJobUrl(source.sourceUrl)).toBe(
      "https://djinni.co/jobs/845514-role/",
    );
    const first = normalizeVacancy(source);
    const second = normalizeVacancy(source);
    expect(first).toEqual(second);
    expect(first).toEqual(
      expect.objectContaining({
        canonicalUrl: "https://djinni.co/jobs/845514-role/",
        workMode: "remote",
        publicationDateVerified: true,
      }),
    );
  });

  it("applies hard filters and emits an explainable score", () => {
    const result = scoreVacancy({
      vacancy: normalizeVacancy(source),
      profile: {
        headline: "Senior Software Engineer",
        targetCountries: ["PL"],
        targetTitles: ["Software Engineer"],
        workModes: ["remote"],
        languages: ["English"],
        excludedCompanies: [],
        salaryMin: null,
        cvText: "TypeScript Node.js PostgreSQL AWS distributed systems",
      },
      windowStart: new Date("2026-10-24T00:00:00.000Z"),
      windowEnd: new Date("2026-10-25T00:00:00.000Z"),
    });

    expect(result.eligible).toBe(true);
    expect(result.shouldPropose).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.reasons.join(" ")).toMatch(/Poland|target title|Profile overlap/);
    expect(result.hardFilterFailures).toEqual([]);
  });

  it("rejects jobs outside the fixed run window even when their title matches", () => {
    const result = scoreVacancy({
      vacancy: normalizeVacancy({ ...source, publishedAt: "2026-10-10T10:00:00.000Z" }),
      profile: {
        headline: null,
        targetCountries: ["PL"],
        targetTitles: ["Software Engineer"],
        workModes: ["remote"],
        languages: [],
        excludedCompanies: [],
        salaryMin: null,
        cvText: null,
      },
      windowStart: new Date("2026-10-24T00:00:00.000Z"),
      windowEnd: new Date("2026-10-25T00:00:00.000Z"),
    });

    expect(result.eligible).toBe(false);
    expect(result.shouldPropose).toBe(false);
    expect(result.hardFilterFailures).toEqual(
      expect.arrayContaining(["outside_run_window", "older_than_seven_days"]),
    );
  });
});
