import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { platformEnum } from "../db/schema";

const localTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const scheduleConfigurationShape = {
    name: z.string().trim().min(1).max(120),
    cadence: z.enum(["daily", "weekly"]),
    timezone: z.string().trim().min(1).max(128),
    localTime: z.string().regex(localTimePattern),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    targetCountries: z.array(z.enum(["PL", "UA"])).min(1).max(2),
    platforms: z
      .array(
        z.object({
          platform: z.enum(platformEnum.enumValues),
          searchLimit: z.number().int().min(1).max(100),
          autoApplyLimit: z.number().int().min(0).max(25),
        }),
      )
      .min(1)
      .max(platformEnum.enumValues.length),
    desiredEnabled: z.boolean(),
} as const;

function validateScheduleConfiguration(
  value: z.infer<z.ZodObject<typeof scheduleConfigurationShape>>,
  context: z.RefinementCtx,
) {
    if (value.cadence === "weekly" && value.dayOfWeek === null) {
      context.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Weekly schedules need a day." });
    }
    if (value.platforms.some((platform) => platform.autoApplyLimit > platform.searchLimit)) {
      context.addIssue({
        code: "custom",
        path: ["platforms"],
        message: "An auto-apply limit cannot exceed its search limit.",
      });
    }
    if (new Set(value.platforms.map((platform) => platform.platform)).size !== value.platforms.length) {
      context.addIssue({ code: "custom", path: ["platforms"], message: "Platforms must be unique." });
    }
    try {
      Temporal.Now.zonedDateTimeISO(value.timezone);
    } catch {
      context.addIssue({ code: "custom", path: ["timezone"], message: "Use a valid IANA timezone." });
    }
}

export const scheduleConfigurationSchema = z
  .object(scheduleConfigurationShape)
  .superRefine(validateScheduleConfiguration);

export const scheduleInputSchema = z
  .object({ requestId: z.string().uuid(), ...scheduleConfigurationShape })
  .superRefine(validateScheduleConfiguration);

export const scheduleUpdateInputSchema = scheduleConfigurationSchema;

export const schedulePreviewInputSchema = z
  .object({
    cadence: z.enum(["daily", "weekly"]),
    timezone: z.string().trim().min(1).max(128),
    localTime: z.string().regex(localTimePattern),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
  })
  .superRefine((value, context) => {
    if (value.cadence === "weekly" && value.dayOfWeek === null) {
      context.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Weekly schedules need a day." });
    }
    try {
      Temporal.Now.zonedDateTimeISO(value.timezone);
    } catch {
      context.addIssue({ code: "custom", path: ["timezone"], message: "Use a valid IANA timezone." });
    }
  });

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type ScheduleConfiguration = z.infer<typeof scheduleConfigurationSchema>;

export function nextScheduleOccurrence(input: {
  now: Date | string;
  timezone: string;
  localTime: string;
  cadence: "daily" | "weekly";
  dayOfWeek: number | null;
}) {
  const nowInstant =
    input.now instanceof Date
      ? Temporal.Instant.fromEpochMilliseconds(input.now.getTime())
      : Temporal.Instant.from(input.now);
  const now = nowInstant.toZonedDateTimeISO(input.timezone);
  const [hour, minute] = input.localTime.split(":").map(Number);
  if (hour === undefined || minute === undefined || !localTimePattern.test(input.localTime)) {
    throw new RangeError("localTime must use 24-hour HH:mm format.");
  }

  let date = now.toPlainDate();
  if (input.cadence === "weekly") {
    if (input.dayOfWeek === null) throw new RangeError("Weekly schedules require dayOfWeek.");
    const temporalTargetDay = input.dayOfWeek === 0 ? 7 : input.dayOfWeek;
    const daysForward = (temporalTargetDay - date.dayOfWeek + 7) % 7;
    date = date.add({ days: daysForward });
  }

  let candidate = date.toZonedDateTime({
    timeZone: input.timezone,
    plainTime: new Temporal.PlainTime(hour, minute),
  });
  if (Temporal.ZonedDateTime.compare(candidate, now) <= 0) {
    candidate = candidate.add({ days: input.cadence === "daily" ? 1 : 7 });
  }
  return new Date(candidate.toInstant().epochMilliseconds);
}
