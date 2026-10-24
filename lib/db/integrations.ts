import { and, eq } from "drizzle-orm";
import { platformCatalog } from "../domain/platform-catalog";
import { getDb } from "./client";
import { platformIntegrations } from "./schema";

export async function listPlatformIntegrations(input: { tenantId: string; ownerId: string }) {
  const connected = await getDb()
    .select()
    .from(platformIntegrations)
    .where(
      and(
        eq(platformIntegrations.tenantId, input.tenantId),
        eq(platformIntegrations.ownerId, input.ownerId),
      ),
    );
  const byPlatform = new Map(connected.map((integration) => [integration.platform, integration]));
  return platformCatalog.map((catalog) => {
    const integration = byPlatform.get(catalog.key);
    return {
      ...catalog,
      status: integration?.status ?? ("disconnected" as const),
      capabilities: integration?.capabilities ?? {
        discover: false,
        prepare: false,
        submit: false,
        track: false,
      },
      lastVerifiedAt: integration?.lastVerifiedAt ?? null,
    };
  });
}
