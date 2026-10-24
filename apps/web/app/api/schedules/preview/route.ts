import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { schedulePreviewInputSchema, nextScheduleOccurrence } from "@jobpilot/domain/schedule";
import { scheduledSearchWindow } from "@jobpilot/domain/search-window";

export async function POST(request: Request) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const body = schedulePreviewInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Check the schedule timezone and time." }, { status: 400 });
  const nextRunAt = nextScheduleOccurrence({ now: new Date(), ...body.data });
  const window = scheduledSearchWindow({
    scheduledAt: nextRunAt,
    timezone: body.data.timezone,
    cadence: body.data.cadence,
  });
  return Response.json({
    nextRunAt: nextRunAt.toISOString(),
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    timezone: body.data.timezone,
  });
}
