import { describe, expect, it } from "vitest";
import { candidateProfileInputSchema, extractProfileSuggestions, splitProfileList } from "./profile";

describe("candidate profile", () => {
  it("extracts only conservative CV suggestions", () => {
    const result = extractProfileSuggestions({
      text: "Dmytro Tarasiuk\nSenior Software Engineer\ndmytro@example.com\nLanguages: English, Ukrainian",
      pageCount: 2,
    });

    expect(result).toMatchObject({
      displayName: "Dmytro Tarasiuk",
      headline: "Senior Software Engineer",
      languages: ["English", "Ukrainian"],
      pageCount: 2,
    });
  });

  it("normalizes unique comma and newline separated values", () => {
    expect(splitProfileList("Backend, Platform\nBackend")).toEqual(["Backend", "Platform"]);
  });

  it("rejects unsupported salary currencies", () => {
    expect(
      candidateProfileInputSchema.safeParse({
        displayName: "Dmytro",
        headline: "Engineer",
        targetCountries: ["PL"],
        targetTitles: [],
        workModes: ["remote"],
        languages: [],
        excludedCompanies: [],
        salaryMin: 1,
        salaryCurrency: "GBP",
        salaryPeriod: "annual",
      }).success,
    ).toBe(false);
  });
});
