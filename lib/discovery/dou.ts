import { XMLParser, XMLValidator } from "fast-xml-parser";
import { canonicalizeJobUrl, sha256, type SourceVacancy, type TargetCountryCode } from "../domain/job";
import type { DiscoveryBatch, DiscoveryFailure, DiscoveryInput } from "./types";

const DOU_RSS_URL = "https://jobs.dou.ua/vacancies/feeds/";
const MAX_FEED_BYTES = 3 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

const polandPattern = /\bpoland\b|\bpolska\b|польщ|warszaw|warsaw|krak[oó]w|wroc[łl]aw|gda[ńn]sk|pozna[ńn]|[łl][oó]d[źz]|katowice|bia[łl]ystok|rzesz[oó]w|lublin/i;
const ukrainePattern = /\bukraine\b|україн|київ|kyiv|kiev|львів|lviv|харків|kharkiv|дніпр|dnipro|одес|odes|вінниц|vinnyts|івано-франків|ivano-frank|чернівц|cherniv|терноп|ternop|ужгород|uzhhorod|запоріж|zaporizh|луцьк|lutsk|рівне|rivne|житомир|zhytomyr|чернігів|chernihiv|черкас|cherkas|полтав|poltav|миколаїв|mykolaiv|сум(?:и|y)|кропивницьк|kropyvnyts|хмельницьк|khmelnyts|віддалено|remote/i;

export class DouDiscoveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "DouDiscoveryError";
  }
}

export async function discoverDouVacancies(
  input: DiscoveryInput,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryBatch> {
  const response = await fetchImpl(DOU_RSS_URL, {
    headers: {
      accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      "user-agent": "JobPilot/1.0 (official DOU RSS discovery)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new DouDiscoveryError(
      `dou_rss_http_${response.status}`,
      retryable,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FEED_BYTES) throw new DouDiscoveryError("dou_rss_too_large", false);
  const xml = await response.text();
  if (Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES) {
    throw new DouDiscoveryError("dou_rss_too_large", false);
  }

  const parsed = parseDouFeed(xml);
  const targetCountries = new Set(input.targetCountries);
  const records = new Map<string, SourceVacancy>();
  let rejectedOutsideRunWindow = 0;
  let rejectedDuplicateInBatch = 0;
  let rejectedCountryNotSelected = 0;
  for (const record of parsed.records) {
    if (!targetCountries.has(record.countryCode)) {
      rejectedCountryNotSelected += 1;
      continue;
    }
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
    platform: "dou",
    records: limitedRecords,
    failures: parsed.failures,
    diagnostics: {
      feedsRequested: 1,
      sourceItemsRetrieved:
        parsed.records.length + parsed.failures.length + parsed.rejectedUnsupportedCountry,
      sourceItemsParsed: parsed.records.length,
      sourceItemsMalformed: parsed.failures.length,
      rejectedOutsideRunWindow,
      rejectedDuplicateInBatch,
      rejectedCountryNotSelected,
      rejectedUnsupportedCountry: parsed.rejectedUnsupportedCountry,
      recordsSelected: limitedRecords.length,
    },
  };
}

export function parseDouFeed(xml: string) {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new DouDiscoveryError("dou_rss_invalid_xml", true);
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    processEntities: true,
    trimValues: false,
    isArray: (_name, jPath) => jPath === "rss.channel.item",
  });
  const document = parser.parse(xml) as { rss?: { channel?: { item?: unknown[] } } };
  const items = Array.isArray(document.rss?.channel?.item) ? document.rss.channel.item : [];
  const records: SourceVacancy[] = [];
  const failures: DiscoveryFailure[] = [];
  let rejectedUnsupportedCountry = 0;

  for (const value of items) {
    const item = asRecord(value);
    const rawTitle = asString(item.title);
    const link = asString(item.link) || asString(item.guid);
    const descriptionHtml = asString(item.description);
    const rawPublishedAt = asString(item.pubDate);
    const parsedTitle = parseDouTitle(rawTitle);
    const countryCode = inferDouCountry(parsedTitle.location ?? "");
    const sourcePayload = {
      title: rawTitle,
      link,
      description: descriptionHtml,
      pubDate: rawPublishedAt,
      guid: asString(item.guid),
      company: parsedTitle.company,
      location: parsedTitle.location,
      inferredCountry: countryCode,
      feedUrl: DOU_RSS_URL,
    };
    const rawHash = sha256(JSON.stringify(sourcePayload));

    try {
      const canonicalUrl = canonicalizeJobUrl(link);
      const externalId = extractDouExternalId(canonicalUrl);
      if (!externalId) throw new Error("external_id_missing");
      const publishedAt = normalizePublishedAt(rawPublishedAt);
      if (!publishedAt) throw new Error("publication_date_missing_or_invalid");
      if (!countryCode) {
        rejectedUnsupportedCountry += 1;
        continue;
      }
      records.push({
        platform: "dou",
        externalId,
        sourceUrl: canonicalUrl,
        countryCode,
        title: parsedTitle.title,
        company: parsedTitle.company,
        city: parsedTitle.location,
        descriptionHtml,
        publishedAt,
        categories: [],
        sourcePayload,
      });
    } catch (error) {
      failures.push({
        externalId: `invalid:${rawHash.slice(0, 24)}`,
        sourceUrl: link || DOU_RSS_URL,
        sourcePayload,
        failureCode: error instanceof Error ? error.message : "source_item_invalid",
        contentHash: rawHash,
      });
    }
  }
  return { records, failures, rejectedUnsupportedCountry };
}

export function buildDouFeedUrl() {
  return DOU_RSS_URL;
}

function parseDouTitle(value: string) {
  const match = value.match(/^(.*?)\s+в\s+(.+?)(?:,\s*(.+))?$/u);
  return {
    title: match?.[1]?.trim() || value,
    company: match?.[2]?.trim() || "Undisclosed",
    location: match?.[3]?.trim() || null,
  };
}

function inferDouCountry(value: string): TargetCountryCode | null {
  if (polandPattern.test(value)) return "PL";
  if (ukrainePattern.test(value)) return "UA";
  return null;
}

function extractDouExternalId(value: string) {
  const url = new URL(value);
  if (url.hostname !== "jobs.dou.ua" && url.hostname !== "www.jobs.dou.ua") {
    throw new Error("source_host_unsupported");
  }
  return url.pathname.match(/\/vacancies\/(\d+)(?:\/|$)/)?.[1] ?? null;
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

function asString(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object" && "#text" in value) {
    return asString((value as { "#text": unknown })["#text"]);
  }
  return "";
}
