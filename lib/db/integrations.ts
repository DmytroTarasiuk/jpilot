import { and, eq, inArray } from "drizzle-orm";
import { implementedDiscoveryPlatforms, platformCatalog } from "../domain/platform-catalog";
import { getDb } from "./client";
import {
  auditEvents,
  platformIntegrations,
  schedulePlatforms,
  searchSchedules,
  type PlatformKey,
} from "./schema";

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

export async function setDjinniIntegrationConnection(input: {
  tenantId: string;
  ownerId: string;
  connected: boolean;
}) {
  const db = getDb();
  const now = new Date();
  const [integration] = await db
    .insert(platformIntegrations)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      platform: "djinni",
      status: input.connected ? "connected" : "disconnected",
      authMode: "public_rss",
      capabilities: {
        discover: input.connected,
        prepare: false,
        submit: false,
        track: false,
      },
      lastVerifiedAt: null,
    })
    .onConflictDoUpdate({
      target: [
        platformIntegrations.tenantId,
        platformIntegrations.ownerId,
        platformIntegrations.platform,
      ],
      set: {
        status: input.connected ? "connected" : "disconnected",
        authMode: "public_rss",
        capabilities: {
          discover: input.connected,
          prepare: false,
          submit: false,
          track: false,
        },
        lastVerifiedAt: null,
        updatedAt: now,
      },
    })
    .returning();
  if (!integration) throw new Error("Unable to update the Djinni integration.");

  await refreshOwnedScheduleEnablement(input);
  await db.insert(auditEvents).values({
    tenantId: input.tenantId,
    actorType: "user",
    actorId: input.ownerId,
    action: input.connected ? "integration.connected" : "integration.disconnected",
    resourceType: "platform_integration",
    resourceId: integration.id,
    metadata: { platform: "djinni", authMode: "public_rss" },
  });
  return integration;
}

async function refreshOwnedScheduleEnablement(input: { tenantId: string; ownerId: string }) {
  const db = getDb();
  const schedules = await db
    .select({ id: searchSchedules.id, desiredEnabled: searchSchedules.desiredEnabled })
    .from(searchSchedules)
    .where(
      and(
        eq(searchSchedules.tenantId, input.tenantId),
        eq(searchSchedules.ownerId, input.ownerId),
      ),
    );
  if (schedules.length === 0) return;

  const [selected, connected] = await Promise.all([
    db
      .select({ scheduleId: schedulePlatforms.scheduleId, platform: schedulePlatforms.platform })
      .from(schedulePlatforms)
      .where(
        and(
          inArray(
            schedulePlatforms.scheduleId,
            schedules.map((schedule) => schedule.id),
          ),
          eq(schedulePlatforms.enabled, true),
        ),
      ),
    db
      .select({ platform: platformIntegrations.platform })
      .from(platformIntegrations)
      .where(
        and(
          eq(platformIntegrations.tenantId, input.tenantId),
          eq(platformIntegrations.ownerId, input.ownerId),
          eq(platformIntegrations.status, "connected"),
        ),
      ),
  ]);
  const runnable = new Set(
    connected
      .map((integration) => integration.platform)
      .filter((platform) => implementedDiscoveryPlatforms.has(platform)),
  );
  const platformsBySchedule = new Map<string, PlatformKey[]>();
  for (const item of selected) {
    const current = platformsBySchedule.get(item.scheduleId) ?? [];
    current.push(item.platform);
    platformsBySchedule.set(item.scheduleId, current);
  }
  const now = new Date();
  for (const schedule of schedules) {
    const enabled =
      schedule.desiredEnabled &&
      (platformsBySchedule.get(schedule.id) ?? []).some((platform) => runnable.has(platform));
    await db
      .update(searchSchedules)
      .set({ enabled, updatedAt: now })
      .where(eq(searchSchedules.id, schedule.id));
  }
}
