import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "./client";
import { acquireConnectorPermit, recordConnectorFailure, recordConnectorSuccess } from "./connectors";
import { connectorRuntimeStates } from "./schema";
import * as schema from "./schema";

describe("connector runtime controls", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterEach(async () => client.close());

  it("enforces a shared rate limit and opens then recovers the circuit", async () => {
    const productionDb = db as unknown as AppDatabase;
    const started = new Date("2026-10-30T10:00:00.000Z");
    expect(await acquireConnectorPermit({ platform: "dou", now: started, db: productionDb }))
      .toMatchObject({ acquired: true });
    expect(await acquireConnectorPermit({ platform: "dou", now: started, db: productionDb }))
      .toMatchObject({ acquired: false, reason: "rate_limited", retryAfterMs: 2_000 });

    await recordConnectorFailure({ platform: "dou", failureCode: "dou_rss_http_503", latencyMs: 120, now: started, db: productionDb });
    await recordConnectorFailure({ platform: "dou", failureCode: "dou_rss_http_503", latencyMs: 120, now: started, db: productionDb });
    const opened = await recordConnectorFailure({ platform: "dou", failureCode: "dou_rss_http_503", latencyMs: 120, now: started, db: productionDb });
    expect(opened).toMatchObject({ health: "open", consecutiveFailures: 3 });
    expect(await acquireConnectorPermit({ platform: "dou", now: new Date(started.getTime() + 2_000), db: productionDb }))
      .toMatchObject({ acquired: false, reason: "circuit_open" });

    const recoveryTime = new Date(started.getTime() + 5 * 60 * 1_000);
    expect(await acquireConnectorPermit({ platform: "dou", now: recoveryTime, db: productionDb }))
      .toMatchObject({ acquired: true, state: { health: "degraded" } });
    await recordConnectorSuccess({ platform: "dou", latencyMs: 80, now: recoveryTime, db: productionDb });
    expect(await db.select().from(connectorRuntimeStates)).toEqual([
      expect.objectContaining({
        platform: "dou",
        health: "healthy",
        consecutiveFailures: 0,
        circuitOpenUntil: null,
        lastFailureCode: null,
        lastLatencyMs: 80,
      }),
    ]);
  });
});
