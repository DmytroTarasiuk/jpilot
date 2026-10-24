import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export type ScheduledCadence = "daily" | "weekly";

export interface SearchWindow {
  start: Date;
  end: Date;
  timezone: string;
  source: "scheduled" | "manual";
}

export const manualRunInputSchema = z.object({
  requestId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  lookbackDays: z.number().int().min(1).max(7),
});

export function scheduledSearchWindow(input: {
  scheduledAt: Date | string;
  timezone: string;
  cadence: ScheduledCadence;
}): SearchWindow {
  assertTimezone(input.timezone);
  const scheduledInstant = toInstant(input.scheduledAt);
  const scheduledDate = scheduledInstant.toZonedDateTimeISO(input.timezone).toPlainDate();
  const days = input.cadence === "daily" ? 1 : 7;
  const end = startOfDay(scheduledDate, input.timezone);
  const start = startOfDay(scheduledDate.subtract({ days }), input.timezone);

  return {
    start: new Date(start.epochMilliseconds),
    end: new Date(end.epochMilliseconds),
    timezone: input.timezone,
    source: "scheduled",
  };
}

export function manualSearchWindow(input: {
  requestedAt: Date | string;
  timezone: string;
  lookbackDays: number;
}): SearchWindow {
  assertTimezone(input.timezone);
  if (!Number.isInteger(input.lookbackDays) || input.lookbackDays < 1 || input.lookbackDays > 7) {
    throw new RangeError("lookbackDays must be an integer from 1 through 7.");
  }

  const end = toInstant(input.requestedAt);
  const start = end.toZonedDateTimeISO(input.timezone).subtract({ days: input.lookbackDays }).toInstant();
  return {
    start: new Date(start.epochMilliseconds),
    end: new Date(end.epochMilliseconds),
    timezone: input.timezone,
    source: "manual",
  };
}

export function isPostingEligible(input: {
  publishedAt: Date | null;
  publicationDateVerified: boolean;
  window: Pick<SearchWindow, "start" | "end">;
  now: Date;
}) {
  if (!input.publishedAt || !input.publicationDateVerified) return false;
  const ageMs = input.now.getTime() - input.publishedAt.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return (
    ageMs >= 0 &&
    ageMs <= sevenDaysMs &&
    input.publishedAt >= input.window.start &&
    input.publishedAt < input.window.end
  );
}

function toInstant(value: Date | string) {
  return value instanceof Date
    ? Temporal.Instant.fromEpochMilliseconds(value.getTime())
    : Temporal.Instant.from(value);
}

function startOfDay(date: Temporal.PlainDate, timezone: string) {
  return date.toZonedDateTime({ timeZone: timezone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant();
}

function assertTimezone(timezone: string) {
  try {
    Temporal.Now.zonedDateTimeISO(timezone);
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }
}
