"use server";

import { randomUUID } from "node:crypto";
import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { recordPrivacyConsent } from "@jobpilot/db/privacy";
import { revalidatePath } from "next/cache";

export async function savePrivacyConsent(formData: FormData) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  await recordPrivacyConsent({
    ...identity,
    consentType: "job_search_processing",
    granted: formData.get("granted") === "on",
    requestId: randomUUID(),
  });
  revalidatePath("/privacy");
}
