import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateCvDocument, getActiveCvDocumentForMatching } from "../db/cv-documents";
import type { AppDatabase } from "../db/client";
import { auditEvents, cvDocuments, tenants, users } from "../db/schema";
import * as schema from "../db/schema";
import { deleteOwnedCvDocument } from "./management";

const extractedProfile = {
  displayName: "Dmytro",
  headline: "Software Engineer",
  languages: ["English"],
  textPreview: "Software Engineer",
  warnings: [],
  pageCount: 2,
};

describe("CV management", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let productionDb: AppDatabase;
  let tenantId: string;
  let ownerId: string;
  let otherTenantId: string;
  let firstDocumentId: string;
  let secondDocumentId: string;

  beforeEach(async () => {
    client = new PGlite();
    db = drizzle({ client, schema });
    productionDb = db as unknown as AppDatabase;
    await migrate(db, { migrationsFolder: "drizzle" });

    tenantId = randomUUID();
    ownerId = randomUUID();
    otherTenantId = randomUUID();
    firstDocumentId = randomUUID();
    secondDocumentId = randomUUID();
    await db.insert(tenants).values([
      { id: tenantId, externalKey: "tenant:cv", name: "CV tenant" },
      { id: otherTenantId, externalKey: "tenant:other", name: "Other tenant" },
    ]);
    await db.insert(users).values({ id: ownerId, clerkUserId: "user_cv" });
    await db.insert(cvDocuments).values([
      {
        id: firstDocumentId,
        tenantId,
        ownerId,
        status: "ready",
        objectKey: `tenants/${tenantId}/users/${ownerId}/cv/${firstDocumentId}.pdf`,
        originalName: "first.pdf",
        contentType: "application/pdf",
        sizeBytes: 1_024,
        isActive: true,
        processingStatus: "confirmed",
        scanStatus: "skipped",
        parsedText: "legacy java profile",
        extractedProfile,
        confirmedAt: new Date("2026-10-20T00:00:00.000Z"),
      },
      {
        id: secondDocumentId,
        tenantId,
        ownerId,
        status: "ready",
        objectKey: `tenants/${tenantId}/users/${ownerId}/cv/${secondDocumentId}.pdf`,
        originalName: "second.pdf",
        contentType: "application/pdf",
        sizeBytes: 2_048,
        isActive: false,
        processingStatus: "confirmed",
        scanStatus: "skipped",
        parsedText: "selected typescript profile",
        extractedProfile,
        confirmedAt: new Date("2026-10-21T00:00:00.000Z"),
      },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("selects exactly one tenant-owned CV and exposes only it to matching", async () => {
    expect(
      await activateCvDocument(
        { id: secondDocumentId, tenantId: otherTenantId, ownerId },
        productionDb,
      ),
    ).toBeNull();

    const activated = await activateCvDocument(
      { id: secondDocumentId, tenantId, ownerId, requestId: "activate-second" },
      productionDb,
    );
    expect(activated).toEqual({ id: secondDocumentId, originalName: "second.pdf" });

    const rows = await db
      .select({ id: cvDocuments.id, isActive: cvDocuments.isActive })
      .from(cvDocuments);
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: firstDocumentId, isActive: false },
        { id: secondDocumentId, isActive: true },
      ]),
    );
    await expect(
      getActiveCvDocumentForMatching({ tenantId, ownerId }, productionDb),
    ).resolves.toEqual({ id: secondDocumentId, parsedText: "selected typescript profile" });

    const events = await db.select().from(auditEvents);
    expect(events).toEqual([
      expect.objectContaining({ action: "cv.activated", resourceId: secondDocumentId }),
    ]);
  });

  it("deletes the owned R2 object, scrubs CV data, and preserves an audited tombstone", async () => {
    await activateCvDocument({ id: secondDocumentId, tenantId, ownerId }, productionDb);
    const deleteObject = vi.fn(async (_objectKey: string) => undefined);

    const crossTenant = await deleteOwnedCvDocument(
      { id: secondDocumentId, tenantId: otherTenantId, ownerId },
      { db: productionDb, deleteObject },
    );
    expect(crossTenant).toBeNull();
    expect(deleteObject).not.toHaveBeenCalled();

    const deleted = await deleteOwnedCvDocument(
      { id: secondDocumentId, tenantId, ownerId, requestId: "delete-second" },
      { db: productionDb, deleteObject },
    );
    expect(deleted).toEqual({ id: secondDocumentId, originalName: "[deleted CV]" });
    expect(deleteObject).toHaveBeenCalledOnce();
    expect(deleteObject.mock.calls[0]?.[0]).toContain(secondDocumentId);

    const [tombstone] = await db
      .select()
      .from(cvDocuments)
      .where(eq(cvDocuments.id, secondDocumentId));
    expect(tombstone).toEqual(
      expect.objectContaining({
        status: "deleted",
        objectKey: `deleted/${secondDocumentId}`,
        originalName: "[deleted CV]",
        isActive: false,
        sha256: null,
        parsedText: null,
        extractedProfile: null,
      }),
    );
    expect(tombstone?.deletedAt).toBeInstanceOf(Date);
    await expect(
      getActiveCvDocumentForMatching({ tenantId, ownerId }, productionDb),
    ).resolves.toBeNull();

    const events = await db.select().from(auditEvents);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "cv.deleted", resourceId: secondDocumentId }),
      ]),
    );
  });

  it("keeps a failed object cleanup retryable without allowing matching", async () => {
    const unavailable = vi.fn(async () => {
      throw new Error("r2_unavailable");
    });
    await expect(
      deleteOwnedCvDocument(
        { id: firstDocumentId, tenantId, ownerId },
        { db: productionDb, deleteObject: unavailable },
      ),
    ).rejects.toThrow("r2_unavailable");

    const [pending] = await db
      .select({ status: cvDocuments.status, isActive: cvDocuments.isActive })
      .from(cvDocuments)
      .where(eq(cvDocuments.id, firstDocumentId));
    expect(pending).toEqual({ status: "deleting", isActive: false });
    await expect(
      getActiveCvDocumentForMatching({ tenantId, ownerId }, productionDb),
    ).resolves.toBeNull();

    const recovered = vi.fn(async (_objectKey: string) => undefined);
    await expect(
      deleteOwnedCvDocument(
        { id: firstDocumentId, tenantId, ownerId },
        { db: productionDb, deleteObject: recovered },
      ),
    ).resolves.toEqual({ id: firstDocumentId, originalName: "[deleted CV]" });
  });
});
