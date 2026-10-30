"use server";

import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { createSupportGrant, revokeSupportGrant } from "@jobpilot/db/support";
import { revalidatePath } from "next/cache";

export async function grantSupportAccess(formData: FormData) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  await createSupportGrant({
    ...identity,
    supportPrincipal: String(formData.get("supportPrincipal") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    durationHours: Number(formData.get("durationHours") ?? 0),
  });
  revalidatePath("/support");
}

export async function revokeSupportAccess(formData: FormData) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  const grantId = String(formData.get("grantId") ?? "");
  await revokeSupportGrant({ ...identity, grantId });
  revalidatePath("/support");
}
