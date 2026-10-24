import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { fromBufferPromise } from "yauzl";
import { z } from "zod";
import { getMalwareScannerEnvironment } from "../env/server";
import { extractProfileSuggestions } from "../domain/profile";

const MAX_PARSED_TEXT = 250_000;
const MAX_PDF_PAGES = 10;
const MAX_DOCX_ENTRIES = 250;
const MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const scannerResponseSchema = z.object({
  verdict: z.enum(["clean", "infected"]),
  provider: z.string().trim().min(1).max(80),
  signature: z.string().trim().max(160).optional(),
});

export class CvProcessingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CvProcessingError";
  }
}

export async function inspectAndExtractCv(input: {
  bytes: Buffer;
  contentType: string;
  originalName: string;
  onScanClean?: (sha256: string) => Promise<void>;
}) {
  validateMagicBytes(input.bytes, input.contentType);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const scan = await scanForMalware({ ...input, sha256 });
  if (scan.verdict !== "clean") {
    throw new CvProcessingError("malware_detected", "The malware scanner rejected the document.");
  }
  await input.onScanClean?.(sha256);

  const extracted =
    input.contentType === "application/pdf"
      ? await extractPdfText(input.bytes)
      : await extractDocxText(input.bytes);
  const normalizedText = extracted.text.replace(/\u0000/g, "").slice(0, MAX_PARSED_TEXT);
  return {
    sha256,
    scan,
    parsedText: normalizedText,
    extractedProfile: extractProfileSuggestions({
      text: normalizedText,
      pageCount: extracted.pageCount,
    }),
  };
}

function validateMagicBytes(bytes: Buffer, contentType: string) {
  const pdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const zip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(bytes[2] ?? -1) &&
    [0x04, 0x06, 0x08].includes(bytes[3] ?? -1);
  if (contentType === "application/pdf" ? !pdf : !zip) {
    throw new CvProcessingError("content_signature_mismatch", "The document signature is invalid.");
  }
}

async function scanForMalware(input: {
  bytes: Buffer;
  contentType: string;
  originalName: string;
  sha256: string;
}) {
  const environment = getMalwareScannerEnvironment();
  if (!environment) {
    throw new CvProcessingError(
      "malware_scanner_unavailable",
      "A private malware scanner must be configured before CV parsing is enabled.",
    );
  }

  let response: Response;
  try {
    response = await fetch(environment.MALWARE_SCAN_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${environment.MALWARE_SCAN_TOKEN}`,
        "content-type": "application/octet-stream",
        "x-content-sha256": input.sha256,
        "x-document-content-type": input.contentType,
        "x-document-name": encodeURIComponent(input.originalName),
      },
      body: new Uint8Array(input.bytes),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new CvProcessingError("malware_scanner_error", "The malware scanner could not be reached.");
  }
  if (!response.ok) {
    throw new CvProcessingError("malware_scanner_error", "The malware scanner returned an error.");
  }
  const parsed = scannerResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new CvProcessingError("malware_scanner_invalid_response", "The malware scanner response was invalid.");
  }
  return parsed.data;
}

async function extractPdfText(bytes: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    maxImageSize: 16_777_216,
  });
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new CvProcessingError("pdf_page_limit", `PDF documents may contain at most ${MAX_PDF_PAGES} pages.`);
    }
    const result = await extractText(pdf, { mergePages: true });
    return { text: result.text, pageCount: result.totalPages };
  } finally {
    await (pdf as typeof pdf & { destroy?: () => Promise<void> }).destroy?.();
  }
}

async function extractDocxText(bytes: Buffer) {
  const archive = await fromBufferPromise(bytes, {
    lazyEntries: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
  let entries = 0;
  let uncompressedBytes = 0;
  let hasContentTypes = false;
  let hasDocument = false;
  try {
    for await (const entry of archive.eachEntry()) {
      entries += 1;
      uncompressedBytes += entry.uncompressedSize;
      hasContentTypes ||= entry.fileName === "[Content_Types].xml";
      hasDocument ||= entry.fileName === "word/document.xml";
      if (entries > MAX_DOCX_ENTRIES || uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
        throw new CvProcessingError("docx_archive_limit", "The DOCX archive expands beyond safe limits.");
      }
    }
  } finally {
    archive.close();
  }
  if (!hasContentTypes || !hasDocument) {
    throw new CvProcessingError("docx_structure_invalid", "The DOCX structure is invalid.");
  }
  const result = await mammoth.extractRawText({ buffer: bytes });
  return { text: result.value, pageCount: null };
}
