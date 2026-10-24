import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { deleteSearchSchedule, updateSearchSchedule } from "@jobpilot/db/schedules";
import { scheduleUpdateInputSchema } from "@jobpilot/domain/schedule";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ scheduleId: string }> },
) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const body = scheduleUpdateInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Check the schedule configuration." }, { status: 400 });
  const { scheduleId } = await context.params;
  const schedule = await updateSearchSchedule({ id: scheduleId, ...identity, schedule: body.data });
  if (!schedule) return Response.json({ error: "Schedule not found." }, { status: 404 });
  return Response.json({
    id: schedule.id,
    enabled: schedule.enabled,
    desiredEnabled: schedule.desiredEnabled,
    nextRunAt: schedule.nextRunAt.toISOString(),
    pausedReason: schedule.desiredEnabled && !schedule.enabled ? "no_connected_discovery_integration" : null,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ scheduleId: string }> },
) {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) return Response.json({ error: "Authentication is required." }, { status: 401 });
  const { scheduleId } = await context.params;
  const deleted = await deleteSearchSchedule({ id: scheduleId, ...identity });
  if (!deleted) return Response.json({ error: "Schedule not found." }, { status: 404 });
  return Response.json({ id: deleted.id });
}
