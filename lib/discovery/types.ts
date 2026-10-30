import type { PlatformKey } from "../db/schema";
import type { SourceVacancy } from "../domain/job";

export type DiscoveryPlatform = Extract<PlatformKey, "djinni" | "dou">;

export interface DiscoveryFailure {
  externalId: string;
  sourceUrl: string;
  sourcePayload: Record<string, unknown>;
  failureCode: string;
  contentHash: string;
}

export interface DiscoveryDiagnostics {
  feedsRequested: number;
  sourceItemsRetrieved: number;
  sourceItemsParsed: number;
  sourceItemsMalformed: number;
  rejectedOutsideRunWindow: number;
  rejectedDuplicateInBatch: number;
  recordsSelected: number;
  rejectedCountryNotSelected?: number;
  rejectedUnsupportedCountry?: number;
}

export interface DiscoveryBatch {
  platform: DiscoveryPlatform;
  records: SourceVacancy[];
  failures: DiscoveryFailure[];
  diagnostics: DiscoveryDiagnostics;
}

export interface DiscoveryInput {
  targetCountries: Array<"PL" | "UA">;
  windowStart: Date;
  windowEnd: Date;
  limit: number;
}

export type DiscoveryAdapter = (
  input: DiscoveryInput,
  fetchImpl?: typeof fetch,
) => Promise<DiscoveryBatch>;
