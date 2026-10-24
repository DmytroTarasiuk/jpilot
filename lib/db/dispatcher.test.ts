import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("./client", () => ({
  getDb: () => ({ execute: mocks.execute }),
}));

import { claimDueSchedules } from "./dispatcher";

describe("scheduled search leasing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ rows: [] });
  });

  it("passes a concrete timestamptz lease expiration instead of adding an ambiguous interval", async () => {
    const now = new Date("2026-10-24T11:50:04.488Z");

    await claimDueSchedules({ now, limit: 25 });

    const query = mocks.execute.mock.calls[0]?.[0];
    const compiled = new PgDialect().sqlToQuery(query);
    expect(compiled.sql).toContain("lease_expires_at = $4");
    expect(compiled.sql).not.toContain("$4 + INTERVAL");
    expect(compiled.params).toEqual([
      now,
      now,
      25,
      new Date("2026-10-24T12:20:04.488Z"),
      now,
    ]);
  });
});
