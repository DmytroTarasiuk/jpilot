import { and, eq, ne } from "drizzle-orm";
import { getDb } from "./client";
import { cvDocuments } from "./schema";

export async function createPendingCvDocument(input: {
  id: string;
  tenantId: string;
  ownerId: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}) {
  const [record] = await getDb().insert(cvDocuments).values(input).returning();
  if (!record) throw new Error("Unable to create the CV upload record.");
  return record;
}

export async function findOwnedCvDocument(input: {
  id: string;
  tenantId: string;
  ownerId: string;
}) {
  const [record] = await getDb()
    .select()
    .from(cvDocuments)
    .where(
      and(
        eq(cvDocuments.id, input.id),
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        ne(cvDocuments.status, "deleted"),
      ),
    )
    .limit(1);
  return record ?? null;
}

export async function markCvDocumentReady(input: {
  id: string;
  tenantId: string;
  ownerId: string;
}) {
  const db = getDb();
  await db
    .update(cvDocuments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(cvDocuments.tenantId, input.tenantId), eq(cvDocuments.ownerId, input.ownerId)));

  const [record] = await db
    .update(cvDocuments)
    .set({ status: "ready", isActive: true, updatedAt: new Date() })
    .where(
      and(
        eq(cvDocuments.id, input.id),
        eq(cvDocuments.tenantId, input.tenantId),
        eq(cvDocuments.ownerId, input.ownerId),
        eq(cvDocuments.status, "pending_upload"),
      ),
    )
    .returning();
  return record ?? null;
}
