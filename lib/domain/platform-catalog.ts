import type { PlatformKey } from "../db/schema";

export interface PlatformCatalogEntry {
  key: PlatformKey;
  name: string;
  description: string;
  availability: "planned" | "private_beta" | "available";
  supportedCapabilities: {
    discover: boolean;
    prepare: boolean;
    submit: boolean;
    track: boolean;
  };
}

export const platformCatalog: readonly PlatformCatalogEntry[] = [
  {
    key: "linkedin",
    name: "LinkedIn",
    description: "Approved API access is required. External applications remain manual.",
    availability: "planned",
    supportedCapabilities: { discover: false, prepare: true, submit: false, track: false },
  },
  {
    key: "just_join_it",
    name: "Just Join IT",
    description: "Discovery integration is the leading Phase 2 candidate; submission access is unverified.",
    availability: "planned",
    supportedCapabilities: { discover: false, prepare: true, submit: false, track: false },
  },
  {
    key: "no_fluff_jobs",
    name: "No Fluff Jobs",
    description: "Discovery and application capabilities require a documented permitted integration path.",
    availability: "planned",
    supportedCapabilities: { discover: false, prepare: true, submit: false, track: false },
  },
  {
    key: "dou",
    name: "DOU",
    description: "Discovery is planned. External application pages become manual tasks.",
    availability: "planned",
    supportedCapabilities: { discover: false, prepare: true, submit: false, track: false },
  },
  {
    key: "djinni",
    name: "Djinni",
    description: "Discovery uses Djinni's first-party public RSS feed. Applications remain manual.",
    availability: "available",
    supportedCapabilities: { discover: true, prepare: false, submit: false, track: false },
  },
] as const;

// A platform is runnable only after a permitted production adapter ships.
// This deliberately stays separate from user-controlled integration records.
export const implementedDiscoveryPlatforms = new Set<PlatformKey>(["djinni"]);
