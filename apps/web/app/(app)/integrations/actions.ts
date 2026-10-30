"use server";

import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { setPublicFeedIntegrationConnection } from "@jobpilot/db/integrations";
import { revalidatePath } from "next/cache";

export async function updatePublicFeedConnection(formData: FormData) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) throw new Error("Authentication is required.");
  const intent = formData.get("intent");
  const platform = formData.get("platform");
  if (intent !== "connect" && intent !== "disconnect") {
    throw new Error("Unsupported integration action.");
  }
  if (platform !== "djinni" && platform !== "dou") {
    throw new Error("Unsupported public-feed integration.");
  }
  await setPublicFeedIntegrationConnection({
    ...identity,
    platform,
    connected: intent === "connect",
  });
  revalidatePath("/integrations");
  revalidatePath("/schedule");
  revalidatePath("/dashboard");
}
