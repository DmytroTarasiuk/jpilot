import { eq, sql } from "drizzle-orm";
import { getDb, type AppDatabase } from "./client";
import { connectorRuntimeStates, type PlatformKey } from "./schema";

const connectorPolicy: Record<Extract<PlatformKey, "djinni" | "dou">, { minIntervalMs: number }> = {
  djinni: { minIntervalMs: 2_000 },
  dou: { minIntervalMs: 2_000 },
};
const CIRCUIT_FAILURE_THRESHOLD = 3;

export type RunnableConnectorPlatform = keyof typeof connectorPolicy;

export async function acquireConnectorPermit(input: {
  platform: RunnableConnectorPlatform;
  now?: Date;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const nextRequestAt = new Date(now.getTime() + connectorPolicy[input.platform].minIntervalMs);
  const result = await db.execute(sql<{
    platform: RunnableConnectorPlatform;
    health: "healthy" | "degraded" | "open";
    consecutiveFailures: number;
  }>`
    INSERT INTO connector_runtime_states (
      platform, health, consecutive_failures, next_request_at, last_attempt_at, created_at, updated_at
    ) VALUES (
      ${input.platform}::job_platform, 'healthy'::connector_health, 0, ${nextRequestAt}, ${now}, ${now}, ${now}
    )
    ON CONFLICT (platform) DO UPDATE
    SET next_request_at = ${nextRequestAt},
        last_attempt_at = ${now},
        health = CASE
          WHEN connector_runtime_states.circuit_open_until IS NOT NULL
            AND connector_runtime_states.circuit_open_until <= ${now}
            THEN 'degraded'::connector_health
          ELSE connector_runtime_states.health
        END,
        circuit_open_until = CASE
          WHEN connector_runtime_states.circuit_open_until IS NOT NULL
            AND connector_runtime_states.circuit_open_until <= ${now}
            THEN NULL
          ELSE connector_runtime_states.circuit_open_until
        END,
        updated_at = ${now}
    WHERE connector_runtime_states.next_request_at <= ${now}
      AND (
        connector_runtime_states.circuit_open_until IS NULL
        OR connector_runtime_states.circuit_open_until <= ${now}
      )
    RETURNING platform, health, consecutive_failures AS "consecutiveFailures"
  `);
  if (result.rows[0]) return { acquired: true as const, state: result.rows[0] };

  const [state] = await db
    .select()
    .from(connectorRuntimeStates)
    .where(eq(connectorRuntimeStates.platform, input.platform))
    .limit(1);
  const retryAt = state?.circuitOpenUntil && state.circuitOpenUntil > now
    ? state.circuitOpenUntil
    : state?.nextRequestAt ?? nextRequestAt;
  return {
    acquired: false as const,
    reason: state?.circuitOpenUntil && state.circuitOpenUntil > now
      ? ("circuit_open" as const)
      : ("rate_limited" as const),
    retryAfterMs: Math.max(250, retryAt.getTime() - now.getTime()),
    state: state ?? null,
  };
}

export async function recordConnectorSuccess(input: {
  platform: RunnableConnectorPlatform;
  latencyMs: number;
  now?: Date;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const [state] = await db
    .insert(connectorRuntimeStates)
    .values({
      platform: input.platform,
      health: "healthy",
      consecutiveFailures: 0,
      nextRequestAt: now,
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastLatencyMs: Math.max(0, Math.round(input.latencyMs)),
    })
    .onConflictDoUpdate({
      target: connectorRuntimeStates.platform,
      set: {
        health: "healthy",
        consecutiveFailures: 0,
        circuitOpenUntil: null,
        lastSuccessAt: now,
        lastFailureCode: null,
        lastLatencyMs: Math.max(0, Math.round(input.latencyMs)),
        updatedAt: now,
      },
    })
    .returning();
  return state;
}

export async function recordConnectorFailure(input: {
  platform: RunnableConnectorPlatform;
  failureCode: string;
  latencyMs: number;
  now?: Date;
  db?: AppDatabase;
}) {
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const failureCode = input.failureCode.slice(0, 128);
  const latencyMs = Math.max(0, Math.round(input.latencyMs));
  await db.execute(sql`
    INSERT INTO connector_runtime_states (
      platform, health, consecutive_failures, next_request_at, last_attempt_at,
      last_failure_at, last_failure_code, last_latency_ms, created_at, updated_at
    ) VALUES (
      ${input.platform}::job_platform, 'degraded'::connector_health, 1, ${now}, ${now},
      ${now}, ${failureCode}, ${latencyMs}, ${now}, ${now}
    )
    ON CONFLICT (platform) DO UPDATE
    SET consecutive_failures = connector_runtime_states.consecutive_failures + 1,
        health = CASE
          WHEN connector_runtime_states.consecutive_failures + 1 >= ${CIRCUIT_FAILURE_THRESHOLD}
            THEN 'open'::connector_health
          ELSE 'degraded'::connector_health
        END,
        circuit_open_until = CASE
          WHEN connector_runtime_states.consecutive_failures + 1 >= ${CIRCUIT_FAILURE_THRESHOLD}
            THEN ${now}::timestamptz + LEAST(
              INTERVAL '1 hour',
              INTERVAL '5 minutes' * power(
                2,
                greatest(
                  0,
                  connector_runtime_states.consecutive_failures + 1 - ${CIRCUIT_FAILURE_THRESHOLD}
                )
              )::double precision
            )
          ELSE NULL
        END,
        last_failure_at = ${now},
        last_failure_code = ${failureCode},
        last_latency_ms = ${latencyMs},
        updated_at = ${now}
  `);
  const [state] = await db
    .select()
    .from(connectorRuntimeStates)
    .where(eq(connectorRuntimeStates.platform, input.platform))
    .limit(1);
  return state;
}
