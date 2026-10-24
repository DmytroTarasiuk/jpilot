import { z } from "zod";

const shortText = z.string().trim().max(160);
const listItem = z.string().trim().min(1).max(120);

export const candidateProfileInputSchema = z.object({
  displayName: shortText,
  headline: z.string().trim().max(240),
  targetCountries: z.array(z.enum(["PL", "UA"])).min(1).max(2),
  targetTitles: z.array(listItem).max(12),
  workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).max(3),
  languages: z.array(listItem).max(12),
  excludedCompanies: z.array(listItem).max(50),
  salaryMin: z.number().int().min(0).max(10_000_000).nullable(),
  salaryCurrency: z.enum(["PLN", "EUR", "USD", "UAH"]),
  salaryPeriod: z.enum(["monthly", "annual"]),
});

export type CandidateProfileInput = z.infer<typeof candidateProfileInputSchema>;

export interface CvExtractedProfile {
  displayName: string | null;
  headline: string | null;
  languages: string[];
  textPreview: string;
  warnings: string[];
  pageCount: number | null;
}

const languageMatchers = [
  ["English", /\b(?:english|англійська|angielski)\b/i],
  ["Ukrainian", /\b(?:ukrainian|українська|ukraiński)\b/i],
  ["Polish", /\b(?:polish|польська|polski)\b/i],
  ["Russian", /\b(?:russian|російська|rosyjski)\b/i],
] as const;

export function extractProfileSuggestions(input: {
  text: string;
  pageCount?: number | null;
}): CvExtractedProfile {
  const normalized = input.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines.find((line) => line.length >= 2 && line.length <= 100 && !line.includes("@"));
  const headline = lines.find(
    (line) =>
      line !== firstLine &&
      line.length >= 3 &&
      line.length <= 180 &&
      !line.includes("@") &&
      !/^https?:\/\//i.test(line),
  );
  const languages = languageMatchers.flatMap(([language, matcher]) =>
    matcher.test(normalized) ? [language] : [],
  );
  const warnings: string[] = [];
  if (!firstLine) warnings.push("A name could not be suggested from the document.");
  if (normalized.length < 120) warnings.push("Very little selectable text was found; the CV may be image-based.");

  return {
    displayName: firstLine ?? null,
    headline: headline ?? null,
    languages,
    textPreview: normalized.slice(0, 2_000),
    warnings,
    pageCount: input.pageCount ?? null,
  };
}

export function splitProfileList(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}
