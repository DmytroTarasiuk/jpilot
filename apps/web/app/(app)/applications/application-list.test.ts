import { describe, expect, it } from "vitest";
import { filterAndSortApplications, type ApplicationListFilters } from "./application-list";

const applications = [
  {
    id: "one",
    status: "approval_required",
    platform: "djinni",
    countryCode: "PL",
    matchScore: 91,
    title: "Backend Engineer",
    company: "Beta",
    publishedAt: "2026-10-30T10:00:00.000Z",
    createdAt: "2026-10-30T11:00:00.000Z",
    updatedAt: "2026-10-30T11:00:00.000Z",
  },
  {
    id: "two",
    status: "manual_required",
    platform: "dou",
    countryCode: "UA",
    matchScore: 72,
    title: "TypeScript Engineer",
    company: "Alpha",
    publishedAt: "2026-10-29T10:00:00.000Z",
    createdAt: "2026-10-29T11:00:00.000Z",
    updatedAt: "2026-10-31T11:00:00.000Z",
  },
  {
    id: "three",
    status: "dismissed",
    platform: "djinni",
    countryCode: "PL",
    matchScore: 61,
    title: "Legacy Role",
    company: "Gamma",
    publishedAt: null,
    createdAt: "2026-10-28T11:00:00.000Z",
    updatedAt: "2026-10-28T11:00:00.000Z",
  },
] as const;

const recommended: ApplicationListFilters = {
  query: "",
  status: "all",
  platform: "all",
  countryCode: "all",
  minimumScore: 72,
};

describe("application list filtering and sorting", () => {
  it("hides historical sub-threshold applications by default and sorts by match", () => {
    expect(filterAndSortApplications(applications, recommended, "match_desc").map(({ id }) => id)).toEqual([
      "one",
      "two",
    ]);
  });

  it("combines text, status, platform, and country filters", () => {
    expect(filterAndSortApplications(applications, {
      ...recommended,
      query: "typescript",
      status: "manual_required",
      platform: "dou",
      countryCode: "UA",
    }, "updated_desc").map(({ id }) => id)).toEqual(["two"]);
  });

  it("can reveal historical records and apply deterministic alphabetical sorting", () => {
    expect(filterAndSortApplications(applications, {
      ...recommended,
      minimumScore: null,
    }, "company_asc").map(({ id }) => id)).toEqual(["two", "one", "three"]);
  });
});
