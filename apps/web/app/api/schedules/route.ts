import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { createSearchSchedule, listSearchSchedules } from "@jobpilot/db/schedules";
import { scheduleInputSchema } from "@jobpilot/domain/schedule";

export async function POST(request: Request) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });

  const body = scheduleInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { error: "Check the schedule, timezone, platform limits, and selected countries." },
      { status: 400 },
    );
  }

  const schedule = await createSearchSchedule({
    tenantId: identity.tenantId,
    ownerId: identity.userId,
    schedule: body.data,
  });
  return Response.json({
    id: schedule.id,
    name: schedule.name,
    enabled: schedule.enabled,
    nextRunAt: schedule.nextRunAt.toISOString(),
    desiredEnabled: schedule.desiredEnabled,
    pausedReason: schedule.desiredEnabled && !schedule.enabled ? "no_connected_discovery_integration" : null,
  });
}

export async function GET() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const schedules = await listSearchSchedules(identity);
  return Response.json({ schedules });
}
