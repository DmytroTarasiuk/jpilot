"use server";

import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { getVerifiedPrimaryEmail } from "@jobpilot/auth/email";
import { markOwnedNotificationRead, updateNotificationPreferences } from "@jobpilot/db/notifications";
import { revalidatePath } from "next/cache";

export async function markNotificationRead(formData: FormData) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  const notificationId = formData.get("notificationId");
  if (typeof notificationId !== "string" || !notificationId) throw new Error("Notification is required.");
  await markOwnedNotificationRead({ ...identity, notificationId });
  revalidatePath("/notifications");
}

export async function saveNotificationPreferences(formData: FormData) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  const emailEnabled = formData.get("emailEnabled") === "on";
  const verifiedEmail = emailEnabled ? await getVerifiedPrimaryEmail() : null;
  if (emailEnabled && !verifiedEmail) {
    throw new Error("Verify a primary email address in your account before enabling email summaries.");
  }
  await updateNotificationPreferences({
    ...identity,
    emailEnabled,
    emailAddress: verifiedEmail,
  });
  revalidatePath("/notifications");
}
