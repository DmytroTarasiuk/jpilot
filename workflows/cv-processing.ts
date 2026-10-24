export async function cvProcessingWorkflow(documentId: string) {
  "use workflow";

  console.info("CV processing workflow started", { documentId });
  const result = await processCvDocumentStep(documentId);
  console.info("CV processing workflow finished", { documentId, status: result.status });
  return result;
}

async function processCvDocumentStep(documentId: string) {
  "use step";

  console.info("validating, scanning, and parsing CV", { documentId });
  const {
    beginCvProcessing,
    completeCvProcessing,
    failCvProcessing,
    markCvParsing,
  } = await import("../lib/db/cv-documents");
  const { downloadPrivateObject } = await import("../lib/storage/r2");
  const { CvProcessingError, inspectAndExtractCv } = await import("../lib/storage/cv-processing");

  const document = await beginCvProcessing(documentId);
  if (!document) return { status: "duplicate_or_ineligible" as const };

  try {
    const bytes = await downloadPrivateObject(document.objectKey);
    if (bytes.length !== document.sizeBytes) {
      throw new CvProcessingError("content_length_mismatch", "The uploaded object size changed.");
    }
    const result = await inspectAndExtractCv({
      bytes,
      contentType: document.contentType,
      originalName: document.originalName,
      onScanClean: (sha256) => markCvParsing(document.id, sha256),
    });
    await completeCvProcessing({ id: document.id, ...result });
    return { status: "awaiting_confirmation" as const };
  } catch (error) {
    const code = error instanceof CvProcessingError ? error.code : "cv_processing_failed";
    await failCvProcessing({ id: document.id, errorCode: code });
    console.error("CV processing failed", { documentId, code });
    if (code === "malware_scanner_error") throw error;
    return { status: "failed" as const, code };
  }
}
