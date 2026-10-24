import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { ScheduleConfiguration, ScheduleInput } from "../domain/schedule";
import { implementedDiscoveryPlatforms } from "../domain/platform-catalog";
import { nextScheduleOccurrence } from "../domain/schedule";
import { getDb } from "./client";
import {
  candidateProfiles,
  platformIntegrations,
  schedulePlatforms,
  searchSchedules,
} from "./schema";

export async function createSearchSchedule(input: {
  tenantId: string;
  ownerId: string;
  schedule: ScheduleInput;
  now?: Date;
}) {
  const db = getDb();
  const idempotencyKey = `${input.tenantId}:${input.ownerId}:schedule:${input.schedule.requestId}`;
  const [existing] = await db
    .select()
    .from(searchSchedules)
    .where(eq(searchSchedules.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) return existing;

  const scheduleId = randomUUID();
  const nextRunAt = nextScheduleOccurrence({
    now: input.now ?? new Date(),
    timezone: input.schedule.timezone,
    localTime: input.schedule.localTime,
    cadence: input.schedule.cadence,
    dayOfWeek: input.schedule.dayOfWeek,
  });
  const enabled = await canEnableSchedule({
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    selectedPlatforms: input.schedule.platforms.map((item) => item.platform),
    desiredEnabled: input.schedule.desiredEnabled,
  });

  await db.batch([
    db
      .insert(candidateProfiles)
      .values({
        tenantId: input.tenantId,
        ownerId: input.ownerId,
        targetCountries: input.schedule.targetCountries,
      })
      .onConflictDoUpdate({
        target: [candidateProfiles.tenantId, candidateProfiles.ownerId],
        set: { targetCountries: input.schedule.targetCountries, updatedAt: new Date() },
      }),
    db.insert(searchSchedules).values({
      id: scheduleId,
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      idempotencyKey,
      name: input.schedule.name,
      cadence: input.schedule.cadence,
      timezone: input.schedule.timezone,
      localTime: input.schedule.localTime,
      dayOfWeek: input.schedule.cadence === "weekly" ? input.schedule.dayOfWeek : null,
      targetCountries: input.schedule.targetCountries,
      desiredEnabled: input.schedule.desiredEnabled,
      enabled,
      nextRunAt,
    }),
    db.insert(schedulePlatforms).values(
      input.schedule.platforms.map((platform) => ({
        scheduleId,
        platform: platform.platform,
        searchLimit: platform.searchLimit,
        autoApplyLimit: platform.autoApplyLimit,
      })),
    ),
  ]);

  const [created] = await db
    .select()
    .from(searchSchedules)
    .where(
      and(
        eq(searchSchedules.id, scheduleId),
        eq(searchSchedules.tenantId, input.tenantId),
        eq(searchSchedules.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  if (!created) throw new Error("Unable to create the search schedule.");
  return created;
}

export async function listSearchSchedules(input: { tenantId: string; ownerId: string }) {
  const db = getDb();
  const schedules = await db
    .select()
    .from(searchSchedules)
    .where(
      and(
        eq(searchSchedules.tenantId, input.tenantId),
        eq(searchSchedules.ownerId, input.ownerId),
      ),
    )
    .orderBy(desc(searchSchedules.createdAt));
  if (schedules.length === 0) return [];
  const platforms = await db
    .select()
    .from(schedulePlatforms)
    .where(inArray(schedulePlatforms.scheduleId, schedules.map((schedule) => schedule.id)));
  const bySchedule = new Map<string, typeof platforms>();
  for (const platform of platforms) {
    const current = bySchedule.get(platform.scheduleId) ?? [];
    current.push(platform);
    bySchedule.set(platform.scheduleId, current);
  }
  return schedules.map((schedule) => ({ ...schedule, platforms: bySchedule.get(schedule.id) ?? [] }));
}

export async function updateSearchSchedule(input: {
  id: string;
  tenantId: string;
  ownerId: string;
  schedule: ScheduleConfiguration;
  now?: Date;
}) {
  const db = getDb();
  const [owned] = await db
    .select({ id: searchSchedules.id })
    .from(searchSchedules)
    .where(
      and(
        eq(searchSchedules.id, input.id),
        eq(searchSchedules.tenantId, input.tenantId),
        eq(searchSchedules.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  if (!owned) return null;

  const nextRunAt = nextScheduleOccurrence({
    now: input.now ?? new Date(),
    timezone: input.schedule.timezone,
    localTime: input.schedule.localTime,
    cadence: input.schedule.cadence,
    dayOfWeek: input.schedule.dayOfWeek,
  });
  const enabled = await canEnableSchedule({
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    selectedPlatforms: input.schedule.platforms.map((item) => item.platform),
    desiredEnabled: input.schedule.desiredEnabled,
  });
  const now = new Date();
  await db.batch([
    db
      .update(searchSchedules)
      .set({
        name: input.schedule.name,
        cadence: input.schedule.cadence,
        timezone: input.schedule.timezone,
        localTime: input.schedule.localTime,
        dayOfWeek: input.schedule.cadence === "weekly" ? input.schedule.dayOfWeek : null,
        targetCountries: input.schedule.targetCountries,
        desiredEnabled: input.schedule.desiredEnabled,
        enabled,
        nextRunAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(searchSchedules.id, input.id),
          eq(searchSchedules.tenantId, input.tenantId),
          eq(searchSchedules.ownerId, input.ownerId),
        ),
      ),
    db.delete(schedulePlatforms).where(eq(schedulePlatforms.scheduleId, input.id)),
    db.insert(schedulePlatforms).values(
      input.schedule.platforms.map((platform) => ({
        scheduleId: input.id,
        platform: platform.platform,
        searchLimit: platform.searchLimit,
        autoApplyLimit: platform.autoApplyLimit,
      })),
    ),
  ]);
  const updated = (await listSearchSchedules({ tenantId: input.tenantId, ownerId: input.ownerId }))
    .find((schedule) => schedule.id === input.id);
  return updated ?? null;
}

export async function deleteSearchSchedule(input: {
  id: string;
  tenantId: string;
  ownerId: string;
}) {
  const [deleted] = await getDb()
    .delete(searchSchedules)
    .where(
      and(
        eq(searchSchedules.id, input.id),
        eq(searchSchedules.tenantId, input.tenantId),
        eq(searchSchedules.ownerId, input.ownerId),
      ),
    )
    .returning({ id: searchSchedules.id });
  return deleted ?? null;
}

async function canEnableSchedule(input: {
  tenantId: string;
  ownerId: string;
  selectedPlatforms: ScheduleInput["platforms"][number]["platform"][];
  desiredEnabled: boolean;
}) {
  if (!input.desiredEnabled) return false;
  const connected = await getDb()
    .select({ platform: platformIntegrations.platform, capabilities: platformIntegrations.capabilities })
    .from(platformIntegrations)
    .where(
      and(
        eq(platformIntegrations.tenantId, input.tenantId),
        eq(platformIntegrations.ownerId, input.ownerId),
        eq(platformIntegrations.status, "connected"),
        inArray(platformIntegrations.platform, input.selectedPlatforms),
      ),
    );
  return connected.some(
    (integration) =>
      integration.capabilities.discover && implementedDiscoveryPlatforms.has(integration.platform),
  );
}
