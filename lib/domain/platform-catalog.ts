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
    description: "No documented public discovery or applicant submission integration is verified, so this connector remains disabled.",
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
    description: "Discovery uses DOU's first-party public vacancy RSS feed. Applications remain reviewed manual tasks.",
    availability: "available",
    supportedCapabilities: { discover: true, prepare: true, submit: false, track: true },
  },
  {
    key: "djinni",
    name: "Djinni",
    description: "Discovery uses Djinni's first-party public RSS feed. JobPilot prepares a reviewed draft; submission remains manual.",
    availability: "available",
    supportedCapabilities: { discover: true, prepare: true, submit: false, track: true },
  },
] as const;

// A platform is runnable only after a permitted production adapter ships.
// This deliberately stays separate from user-controlled integration records.
export const implementedDiscoveryPlatforms = new Set<PlatformKey>(["djinni", "dou"]);
