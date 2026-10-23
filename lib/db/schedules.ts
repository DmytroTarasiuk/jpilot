import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { ScheduleInput } from "../domain/schedule";
import { nextScheduleOccurrence } from "../domain/schedule";
import { getDb } from "./client";
import { candidateProfiles, schedulePlatforms, searchSchedules } from "./schema";

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
      enabled: false,
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
