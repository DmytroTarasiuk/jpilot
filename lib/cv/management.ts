import {
  beginCvDocumentDeletion,
  completeCvDocumentDeletion,
} from "../db/cv-documents";
import { getDb, type AppDatabase } from "../db/client";
import { deletePrivateObject } from "../storage/r2";

interface DeleteCvDependencies {
  db: AppDatabase;
  deleteObject: (objectKey: string) => Promise<void>;
}

export async function deleteOwnedCvDocument(
  input: {
    id: string;
    tenantId: string;
    ownerId: string;
    requestId?: string | null;
  },
  dependencies: DeleteCvDependencies = {
    db: getDb(),
    deleteObject: deletePrivateObject,
  },
) {
  const claim = await beginCvDocumentDeletion(input, dependencies.db);
  if (!claim) return null;

  await dependencies.deleteObject(claim.objectKey);
  const deleted = await completeCvDocumentDeletion(
    { ...input, wasActive: claim.wasActive },
    dependencies.db,
  );
  if (!deleted) throw new Error("cv_deletion_finalize_failed");
  return deleted;
}
