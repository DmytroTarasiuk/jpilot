import { auth } from "@clerk/nextjs/server";
import { ensureTenantIdentity } from "../db/tenancy";

export async function getAuthenticatedTenantIdentity() {
  const clerk = await auth();
  if (!clerk.userId) return null;

  return ensureTenantIdentity({
    clerkUserId: clerk.userId,
    clerkOrganizationId: clerk.orgId ?? null,
    clerkOrganizationRole: clerk.orgRole ?? null,
  });
}

export async function requireAuthenticatedTenantIdentity() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  return identity;
}
