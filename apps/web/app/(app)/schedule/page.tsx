import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { listSearchSchedules } from "@jobpilot/db/schedules";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScheduleBuilder, type ScheduleView } from "./schedule-builder";

export const metadata: Metadata = { title: "Search schedule" };

export default async function SchedulePage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  const schedules = await listSearchSchedules(identity);
  const initialSchedules: ScheduleView[] = schedules.map((schedule) => ({
    id: schedule.id,
    name: schedule.name,
    cadence: schedule.cadence,
    timezone: schedule.timezone,
    localTime: schedule.localTime,
    dayOfWeek: schedule.dayOfWeek,
    targetCountries: schedule.targetCountries,
    desiredEnabled: schedule.desiredEnabled,
    enabled: schedule.enabled,
    nextRunAt: schedule.nextRunAt.toISOString(),
    platforms: schedule.platforms.map((platform) => ({
      platform: platform.platform,
      searchLimit: platform.searchLimit,
      autoApplyLimit: platform.autoApplyLimit,
    })),
  }));

  return (
    <div className="max-w-4xl">
      <p className="text-sm font-medium text-[#5f7067]">Automation</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Search schedule</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">
        Configure exact local timing, search windows, and per-platform search/application caps.
      </p>
      <div className="mt-8">
        <ScheduleBuilder initialSchedules={initialSchedules} />
      </div>
    </div>
  );
}
