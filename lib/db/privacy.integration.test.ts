import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "./client";
import {
  beginOwnedDataErasure,
  buildOwnedDataExport,
  completeOwnedDataErasure,
} from "./privacy";
import {
  candidateProfiles,
  cvDocuments,
  privacyRequests,
  tenantMembers,
  tenants,
  users,
} from "./schema";
import * as schema from "./schema";

describe("Phase 5 privacy and tenancy controls", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let productionDb: AppDatabase;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle({ client, schema });
    productionDb = db as unknown as AppDatabase;
    await migrate(db, { migrationsFolder: "drizzle" });
  });

  afterEach(async () => {
    await client.close();
  });

  it("keeps concurrent exports isolated across 20 tenants", async () => {
    const identities = Array.from({ length: 20 }, (_, index) => ({
      tenantId: randomUUID(),
      ownerId: randomUUID(),
      index,
    }));
    await db.insert(tenants).values(identities.map(({ tenantId, index }) => ({
      id: tenantId,
      externalKey: `clerk-user:export-${index}`,
      name: `Tenant ${index}`,
    })));
    await db.insert(users).values(identities.map(({ ownerId, index }) => ({
      id: ownerId,
      clerkUserId: `export-user-${index}`,
    })));
    await db.insert(tenantMembers).values(identities.map(({ tenantId, ownerId }) => ({
      tenantId,
      userId: ownerId,
      role: "owner" as const,
    })));
    await db.insert(candidateProfiles).values(identities.map(({ tenantId, ownerId, index }) => ({
      tenantId,
      ownerId,
      displayName: `Candidate ${index}`,
      targetTitles: [`Role ${index}`],
    })));

    const exports = await Promise.all(identities.map((identity) => buildOwnedDataExport({
      tenantId: identity.tenantId,
      ownerId: identity.ownerId,
      requestId: randomUUID(),
      db: productionDb,
    })));
    for (const [index, exported] of exports.entries()) {
      expect(exported.data.candidateProfile).toMatchObject({
        tenantId: identities[index]!.tenantId,
        ownerId: identities[index]!.ownerId,
        displayName: `Candidate ${index}`,
      });
      expect(JSON.stringify(exported)).not.toContain(`Candidate ${(index + 1) % identities.length}`);
    }
  }, 20_000);

  it("fails closed on R2 cleanup and completes a retry without affecting another tenant", async () => {
    const tenantId = randomUUID();
    const ownerId = randomUUID();
    const otherTenantId = randomUUID();
    const otherOwnerId = randomUUID();
    await db.insert(tenants).values([
      { id: tenantId, externalKey: "clerk-user:erase", name: "Erase" },
      { id: otherTenantId, externalKey: "clerk-user:keep", name: "Keep" },
    ]);
    await db.insert(users).values([
      { id: ownerId, clerkUserId: "erase-user" },
      { id: otherOwnerId, clerkUserId: "keep-user" },
    ]);
    await db.insert(tenantMembers).values([
      { tenantId, userId: ownerId, role: "owner" },
      { tenantId: otherTenantId, userId: otherOwnerId, role: "owner" },
    ]);
    await db.insert(candidateProfiles).values([
      { tenantId, ownerId, displayName: "Erase me" },
      { tenantId: otherTenantId, ownerId: otherOwnerId, displayName: "Keep me" },
    ]);
    const cvId = randomUUID();
    await db.insert(cvDocuments).values({
      id: cvId,
      tenantId,
      ownerId,
      status: "ready",
      objectKey: `tenants/${tenantId}/users/${ownerId}/cv/${cvId}.pdf`,
      originalName: "private.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      processingStatus: "confirmed",
      scanStatus: "skipped",
    });

    const request = await beginOwnedDataErasure({
      tenantId,
      ownerId,
      requestId: randomUUID(),
      db: productionDb,
    });
    expect(request).not.toBeNull();
    const unavailable = vi.fn(async () => { throw new Error("r2_unavailable"); });
    await expect(completeOwnedDataErasure({
      tenantId,
      ownerId,
      privacyRequestId: request!.requestId,
      confirmationToken: request!.token,
      db: productionDb,
      deleteObject: unavailable,
    })).rejects.toThrow("r2_unavailable");
    expect(await db.select().from(cvDocuments)).toHaveLength(1);
    expect(await db.select().from(privacyRequests).where(eq(privacyRequests.id, request!.requestId))).toEqual([
      expect.objectContaining({ status: "failed", failureCode: "object_storage_cleanup_failed" }),
    ]);

    const deleteObject = vi.fn(async () => undefined);
    await expect(completeOwnedDataErasure({
      tenantId,
      ownerId,
      privacyRequestId: request!.requestId,
      confirmationToken: request!.token,
      db: productionDb,
      deleteObject,
    })).resolves.toEqual({ requestId: request!.requestId, status: "completed" });
    expect(deleteObject).toHaveBeenCalledWith(expect.stringContaining(cvId));
    expect(await db.select().from(tenants).where(eq(tenants.id, tenantId))).toEqual([]);
    expect(await db.select().from(users).where(eq(users.id, ownerId))).toEqual([]);
    expect(await db.select().from(candidateProfiles).where(eq(candidateProfiles.tenantId, otherTenantId))).toEqual([
      expect.objectContaining({ displayName: "Keep me", ownerId: otherOwnerId }),
    ]);
    expect(await db.select().from(privacyRequests).where(eq(privacyRequests.id, request!.requestId))).toEqual([
      expect.objectContaining({ status: "completed", tenantId: null, ownerId: null, confirmationTokenHash: null }),
    ]);
  });
});
