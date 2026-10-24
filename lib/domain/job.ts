import { createHash } from "node:crypto";

export const MATCH_PROPOSAL_THRESHOLD = 55;

export type TargetCountryCode = "PL" | "UA";
export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";

export interface SourceVacancy {
  platform: "djinni";
  externalId: string;
  sourceUrl: string;
  countryCode: TargetCountryCode;
  title: string;
  descriptionHtml: string;
  publishedAt: string | null;
  categories: string[];
  sourcePayload: Record<string, unknown>;
}

export interface NormalizedVacancy {
  platform: "djinni";
  externalId: string;
  canonicalUrl: string;
  title: string;
  company: string;
  countryCode: TargetCountryCode;
  city: string | null;
  workMode: WorkMode;
  descriptionText: string;
  categories: string[];
  publishedAt: string | null;
  publicationDateVerified: boolean;
  contentHash: string;
}

export interface MatchProfile {
  headline: string | null;
  targetCountries: string[];
  targetTitles: string[];
  workModes: string[];
  languages: string[];
  excludedCompanies: string[];
  salaryMin: number | null;
  cvText: string | null;
}

export interface MatchResult {
  eligible: boolean;
  shouldPropose: boolean;
  score: number;
  reasons: string[];
  concerns: string[];
  hardFilterFailures: string[];
}

const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "source",
]);

const stopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "but",
  "can",
  "company",
  "for",
  "from",
  "have",
  "into",
  "job",
  "our",
  "role",
  "that",
  "the",
  "this",
  "with",
  "you",
  "your",
  "jest",
  "oraz",
  "praca",
  "для",
  "компанія",
  "робота",
  "та",
  "що",
]);

export function canonicalizeJobUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("job_url_protocol_unsupported");
  }
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || trackingParameters.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname !== "/") url.pathname = `${url.pathname.replace(/\/$/, "")}/`;
  return url.toString();
}

export function normalizeVacancy(source: SourceVacancy): NormalizedVacancy {
  const canonicalUrl = canonicalizeJobUrl(source.sourceUrl);
  const title = collapseWhitespace(source.title);
  const descriptionText = htmlToText(source.descriptionHtml);
  if (!title) throw new Error("title_missing");
  if (!descriptionText) throw new Error("description_missing");

  const company = inferCompany(title);
  const workMode = inferWorkMode(`${title}\n${descriptionText}`);
  const normalized = {
    platform: source.platform,
    externalId: source.externalId,
    canonicalUrl,
    title,
    company,
    countryCode: source.countryCode,
    city: null,
    workMode,
    descriptionText,
    categories: [...new Set(source.categories.map(collapseWhitespace).filter(Boolean))].sort(),
    publishedAt: normalizeDate(source.publishedAt),
    publicationDateVerified: source.publishedAt !== null && normalizeDate(source.publishedAt) !== null,
  } satisfies Omit<NormalizedVacancy, "contentHash">;

  return {
    ...normalized,
    contentHash: sha256(JSON.stringify(normalized)),
  };
}

export function scoreVacancy(input: {
  vacancy: NormalizedVacancy;
  profile: MatchProfile;
  windowStart: Date;
  windowEnd: Date;
}): MatchResult {
  const { vacancy, profile, windowStart, windowEnd } = input;
  const reasons: string[] = [];
  const concerns: string[] = [];
  const hardFilterFailures: string[] = [];
  let score = 0;

  if (profile.targetCountries.includes(vacancy.countryCode)) {
    score += 15;
    reasons.push(`Available in ${countryName(vacancy.countryCode)}.`);
  } else {
    hardFilterFailures.push("country_not_selected");
    concerns.push("The vacancy is outside the selected countries.");
  }

  const publishedAt = vacancy.publishedAt ? new Date(vacancy.publishedAt) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) {
    hardFilterFailures.push("publication_date_missing");
    concerns.push("The publication date could not be verified.");
  } else if (!vacancy.publicationDateVerified) {
    hardFilterFailures.push("publication_date_unverified");
    concerns.push("The publication date is unverified.");
  } else {
    if (publishedAt < windowStart || publishedAt >= windowEnd) {
      hardFilterFailures.push("outside_run_window");
      concerns.push("The vacancy falls outside this run's calendar window.");
    }
    const ageMs = windowEnd.getTime() - publishedAt.getTime();
    if (ageMs > 7 * 24 * 60 * 60 * 1_000) {
      hardFilterFailures.push("older_than_seven_days");
      concerns.push("The vacancy is older than seven days.");
    } else if (ageMs >= 0) {
      const ageDays = ageMs / (24 * 60 * 60 * 1_000);
      score += ageDays <= 1 ? 15 : ageDays <= 3 ? 12 : 8;
      reasons.push(ageDays <= 1 ? "Published within the last day." : "Published recently.");
    }
  }

  const excludedCompany = profile.excludedCompanies.find((company) =>
    sameCompany(company, vacancy.company),
  );
  if (excludedCompany) {
    hardFilterFailures.push("company_excluded");
    concerns.push(`${vacancy.company} is on the excluded-company list.`);
  } else if (vacancy.company === "Undisclosed") {
    concerns.push("The RSS item does not identify the employer, so company exclusions could not be checked.");
  }

  if (profile.workModes.length === 0) {
    score += 5;
    concerns.push("No work-mode preference is configured.");
  } else if (vacancy.workMode === "unknown") {
    score += 5;
    concerns.push("The work mode could not be determined from the feed.");
  } else if (profile.workModes.includes(vacancy.workMode)) {
    score += 10;
    reasons.push(`The ${vacancy.workMode} work mode matches your preference.`);
  } else {
    hardFilterFailures.push("work_mode_not_selected");
    concerns.push(`The ${vacancy.workMode} work mode is not selected in your profile.`);
  }

  const titleCandidates = profile.targetTitles.length
    ? profile.targetTitles
    : profile.headline
      ? [profile.headline]
      : [];
  if (titleCandidates.length === 0) {
    score += 15;
    concerns.push("No target title is configured; title relevance received a neutral score.");
  } else {
    const titleScore = bestTitleScore(vacancy.title, titleCandidates);
    score += titleScore;
    if (titleScore >= 32) reasons.push("The job title closely matches a target title.");
    else if (titleScore >= 18) reasons.push("The job title partially matches a target title.");
    else concerns.push("The job title has weak overlap with the selected target titles.");
  }

  const profileText = [
    ...profile.targetTitles,
    profile.headline ?? "",
    ...profile.languages,
    (profile.cvText ?? "").slice(0, 40_000),
  ].join(" ");
  const sharedKeywords = overlapKeywords(
    profileText,
    `${vacancy.title} ${vacancy.categories.join(" ")} ${vacancy.descriptionText}`,
  );
  const keywordScore = Math.min(20, sharedKeywords.length * 4);
  score += keywordScore;
  if (sharedKeywords.length > 0) {
    reasons.push(`Profile overlap: ${sharedKeywords.slice(0, 5).join(", ")}.`);
  } else {
    concerns.push("No strong profile-keyword overlap was found.");
  }

  if (profile.salaryMin !== null) {
    concerns.push("Djinni's RSS feed does not expose structured salary data, so the salary minimum was not enforced.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const eligible = hardFilterFailures.length === 0;
  if (eligible && score < MATCH_PROPOSAL_THRESHOLD) {
    concerns.push(`The match score is below the proposal threshold of ${MATCH_PROPOSAL_THRESHOLD}.`);
  }
  return {
    eligible,
    shouldPropose: eligible && score >= MATCH_PROPOSAL_THRESHOLD,
    score,
    reasons: reasons.slice(0, 8),
    concerns: concerns.slice(0, 8),
    hardFilterFailures,
  };
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function htmlToText(value: string) {
  return collapseWhitespace(
    decodeHtmlEntities(
      value
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, token: string) => {
    if (token.startsWith("#x") || token.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    }
    if (token.startsWith("#")) return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    return named[token.toLowerCase()] ?? entity;
  });
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferCompany(title: string) {
  const match = title.match(/\s(?:@|at)\s+([^|•]{2,80})$/i);
  return match?.[1] ? collapseWhitespace(match[1]) : "Undisclosed";
}

function inferWorkMode(value: string): WorkMode {
  if (/\bhybrid\b|гібрид|hybryd/i.test(value)) return "hybrid";
  if (/\bremote\b|віддал|дистанційн|zdaln/i.test(value)) return "remote";
  if (/\bon[ -]?site\b|офіс|biur[oa]/i.test(value)) return "onsite";
  return "unknown";
}

function sameCompany(expected: string, actual: string) {
  if (actual === "Undisclosed") return false;
  const normalizedExpected = expected.toLocaleLowerCase().trim();
  const normalizedActual = actual.toLocaleLowerCase().trim();
  return normalizedExpected === normalizedActual || normalizedActual.includes(normalizedExpected);
}

function bestTitleScore(title: string, candidates: string[]) {
  const normalizedTitle = title.toLocaleLowerCase();
  let best = 0;
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLocaleLowerCase().trim();
    if (!normalizedCandidate) continue;
    if (normalizedTitle.includes(normalizedCandidate)) {
      best = Math.max(best, 40);
      continue;
    }
    const targetTokens = tokenize(normalizedCandidate);
    if (targetTokens.size === 0) continue;
    const titleTokens = tokenize(normalizedTitle);
    const intersection = [...targetTokens].filter((token) => titleTokens.has(token)).length;
    best = Math.max(best, Math.round((intersection / targetTokens.size) * 40));
  }
  return best;
}

function overlapKeywords(profileText: string, jobText: string) {
  const profileTokens = tokenize(profileText);
  const jobTokens = tokenize(jobText);
  return [...profileTokens].filter((token) => jobTokens.has(token)).sort().slice(0, 20);
}

function tokenize(value: string) {
  return new Set(
    value
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}+#.\-]{2,}/gu)
      ?.map((token) => token.replace(/^[.-]+|[.-]+$/g, ""))
      .filter((token) => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token)) ?? [],
  );
}

function countryName(value: TargetCountryCode) {
  return value === "PL" ? "Poland" : "Ukraine";
}
