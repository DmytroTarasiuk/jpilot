"use server";

import { randomUUID } from "node:crypto";
import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { updateGovernancePolicy } from "@jobpilot/db/governance";
import { revalidatePath } from "next/cache";

export async function saveGovernancePolicy(formData: FormData) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  await updateGovernancePolicy({
    tenantId: identity.tenantId,
    actorId: identity.ownerId,
    role: identity.role,
    sourceSnapshotRetentionDays: numberField(formData, "sourceSnapshotRetentionDays"),
    notificationRetentionDays: numberField(formData, "notificationRetentionDays"),
    auditRetentionDays: numberField(formData, "auditRetentionDays"),
    monthlySearchRunLimit: numberField(formData, "monthlySearchRunLimit"),
    monthlyEmailLimit: numberField(formData, "monthlyEmailLimit"),
    budgetWarningPercent: numberField(formData, "budgetWarningPercent"),
    hardStopSearchRuns: formData.get("hardStopSearchRuns") === "on",
    requestId: randomUUID(),
  });
  revalidatePath("/operations");
}

function numberField(formData: FormData, name: string) {
  return Number(formData.get(name));
}
