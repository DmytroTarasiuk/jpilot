"use server";

import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { setDjinniIntegrationConnection } from "@jobpilot/db/integrations";
import { revalidatePath } from "next/cache";

export async function updateDjinniConnection(formData: FormData) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  const intent = formData.get("intent");
  if (intent !== "connect" && intent !== "disconnect") {
    throw new Error("Unsupported integration action.");
  }
  await setDjinniIntegrationConnection({ ...identity, connected: intent === "connect" });
  revalidatePath("/integrations");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}
