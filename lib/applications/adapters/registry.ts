import type { PlatformKey } from "../../db/schema";
import type { DirectSubmissionAdapter } from "./types";

// No current discovery platform exposes a documented applicant-side submission API.
// Register only adapters backed by a reviewed, permitted integration agreement.
const directSubmissionAdapters = new Map<PlatformKey, DirectSubmissionAdapter>();

export function getDirectSubmissionAdapter(platform: PlatformKey) {
  return directSubmissionAdapters.get(platform) ?? null;
}

