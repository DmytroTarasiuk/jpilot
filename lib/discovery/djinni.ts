import { XMLParser, XMLValidator } from "fast-xml-parser";
import { canonicalizeJobUrl, sha256, type SourceVacancy, type TargetCountryCode } from "../domain/job";

const DJINNI_RSS_URL = "https://djinni.co/jobs/rss/";
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

const djinniCountry = {
  PL: "POL",
  UA: "UKR",
} as const satisfies Record<TargetCountryCode, string>;

export interface DiscoveryFailure {
  externalId: string;
  sourceUrl: string;
  sourcePayload: Record<string, unknown>;
  failureCode: string;
  contentHash: string;
}

export interface DiscoveryBatch {
  platform: "djinni";
  records: SourceVacancy[];
  failures: DiscoveryFailure[];
  diagnostics: DiscoveryDiagnostics;
}

export interface DiscoveryDiagnostics {
  feedsRequested: number;
  sourceItemsRetrieved: number;
  sourceItemsParsed: number;
  sourceItemsMalformed: number;
  rejectedOutsideRunWindow: number;
  rejectedDuplicateInBatch: number;
  recordsSelected: number;
}

export class DjinniDiscoveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "DjinniDiscoveryError";
  }
}

export async function discoverDjinniVacancies(
  input: {
    targetCountries: TargetCountryCode[];
    windowStart: Date;
    windowEnd: Date;
    limit: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryBatch> {
  const countryResults = await Promise.all(
    input.targetCountries.map(async (countryCode) => {
      const feedUrl = buildDjinniFeedUrl(countryCode);
      const response = await fetchImpl(feedUrl, {
        headers: {
          accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
          "user-agent": "JobPilot/1.0 (official Djinni RSS discovery)",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new DjinniDiscoveryError(
          `djinni_rss_http_${response.status}`,
          retryable,
          parseRetryAfter(response.headers.get("retry-after")),
        );
      }
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_FEED_BYTES) {
        throw new DjinniDiscoveryError("djinni_rss_too_large", false);
      }
      const xml = await response.text();
      if (Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES) {
        throw new DjinniDiscoveryError("djinni_rss_too_large", false);
      }
      return parseDjinniFeed(xml, countryCode, feedUrl);
    }),
  );

  const failures = countryResults.flatMap((result) => result.failures);
  const records = new Map<string, SourceVacancy>();
  const parsedRecords = countryResults.flatMap((result) => result.records);
  let rejectedOutsideRunWindow = 0;
  let rejectedDuplicateInBatch = 0;
  for (const record of parsedRecords) {
    const publishedAt = record.publishedAt ? new Date(record.publishedAt) : null;
    if (!publishedAt || publishedAt < input.windowStart || publishedAt >= input.windowEnd) {
      rejectedOutsideRunWindow += 1;
      continue;
    }
    if (records.has(record.externalId)) {
      rejectedDuplicateInBatch += 1;
      continue;
    }
    records.set(record.externalId, record);
  }

  const limitedRecords = [...records.values()]
    .sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""))
    .slice(0, input.limit);
  return {
    platform: "djinni",
    records: limitedRecords,
    failures,
    diagnostics: {
      feedsRequested: input.targetCountries.length,
      sourceItemsRetrieved: parsedRecords.length + failures.length,
      sourceItemsParsed: parsedRecords.length,
      sourceItemsMalformed: failures.length,
      rejectedOutsideRunWindow,
      rejectedDuplicateInBatch,
      recordsSelected: limitedRecords.length,
    },
  };
}

export function parseDjinniFeed(
  xml: string,
  countryCode: TargetCountryCode,
  feedUrl = buildDjinniFeedUrl(countryCode),
) {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new DjinniDiscoveryError("djinni_rss_invalid_xml", true);
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    processEntities: true,
    trimValues: false,
    isArray: (_name, jPath) =>
      typeof jPath === "string" &&
      (jPath === "rss.channel.item" || jPath.endsWith(".category")),
  });
  const document = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown[] } };
  };
  const items = Array.isArray(document.rss?.channel?.item) ? document.rss.channel.item : [];
  const records: SourceVacancy[] = [];
  const failures: DiscoveryFailure[] = [];

  for (const value of items) {
    const item = asRecord(value);
    const title = asString(item.title);
    const link = asString(item.link) || asString(item.guid);
    const descriptionHtml = asString(item.description);
    const rawPublishedAt = asString(item.pubDate);
    const categories = asArray(item.category).map(asString).filter(Boolean);
    const sourcePayload = {
      title,
      link,
      description: descriptionHtml,
      pubDate: rawPublishedAt,
      guid: asString(item.guid),
      categories,
      feedCountry: countryCode,
      feedUrl,
    };
    const rawHash = sha256(JSON.stringify(sourcePayload));

    try {
      const canonicalUrl = canonicalizeJobUrl(link);
      const externalId = extractDjinniExternalId(canonicalUrl);
      if (!externalId) throw new Error("external_id_missing");
      const publishedAt = normalizePublishedAt(rawPublishedAt);
      if (!publishedAt) throw new Error("publication_date_missing_or_invalid");
      records.push({
        platform: "djinni",
        externalId,
        sourceUrl: canonicalUrl,
        countryCode,
        title,
        descriptionHtml,
        publishedAt,
        categories,
        sourcePayload,
      });
    } catch (error) {
      failures.push({
        externalId: `invalid:${rawHash.slice(0, 24)}`,
        sourceUrl: link || feedUrl,
        sourcePayload,
        failureCode: error instanceof Error ? error.message : "source_item_invalid",
        contentHash: rawHash,
      });
    }
  }
  return { records, failures };
}

export function buildDjinniFeedUrl(countryCode: TargetCountryCode) {
  const url = new URL(DJINNI_RSS_URL);
  url.searchParams.set("country", djinniCountry[countryCode]);
  return url.toString();
}

function extractDjinniExternalId(url: string) {
  const parsed = new URL(url);
  if (parsed.hostname !== "djinni.co" && parsed.hostname !== "www.djinni.co") {
    throw new Error("source_host_unsupported");
  }
  return parsed.pathname.match(/^\/jobs\/(\d+)(?:[-/]|$)/)?.[1] ?? null;
}

function normalizePublishedAt(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.max(0, date.getTime() - Date.now());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asString(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object" && "#text" in value) {
    return asString((value as { "#text": unknown })["#text"]);
  }
  return "";
}
