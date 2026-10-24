import { createHash } from "node:crypto";
import CloudmersiveVirusApiClient from "cloudmersive-virus-api-client";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { fromBufferPromise } from "yauzl";
import { z } from "zod";
import { extractProfileSuggestions } from "../domain/profile";
import { getCloudmersiveEnvironment, isCloudmersiveMalwareScanEnabled } from "../env/server";

const MAX_PARSED_TEXT = 250_000;
const MAX_PDF_PAGES = 10;
const MAX_DOCX_ENTRIES = 250;
const MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const cloudmersiveResponseSchema = z.object({
  CleanResult: z.boolean(),
  FoundViruses: z
    .array(
      z.object({
        FileName: z.string().optional(),
        VirusName: z.string().trim().min(1),
      }),
    )
    .nullish(),
  ContainsExecutable: z.boolean().optional(),
  ContainsInvalidFile: z.boolean().optional(),
  ContainsScript: z.boolean().optional(),
  ContainsPasswordProtectedFile: z.boolean().optional(),
  ContainsRestrictedFileFormat: z.boolean().optional(),
  ContainsMacros: z.boolean().optional(),
  ContainsXmlExternalEntities: z.boolean().optional(),
  ContainsInsecureDeserialization: z.boolean().optional(),
  ContainsHtml: z.boolean().optional(),
  ContainsUnsafeArchive: z.boolean().optional(),
  ContainsOleEmbeddedObject: z.boolean().optional(),
  ContainsUnwantedAction: z.boolean().optional(),
  VerifiedFileFormat: z.string().nullish(),
});

const cloudmersiveThreatFlags = [
  "ContainsExecutable",
  "ContainsInvalidFile",
  "ContainsScript",
  "ContainsPasswordProtectedFile",
  "ContainsRestrictedFileFormat",
  "ContainsMacros",
  "ContainsXmlExternalEntities",
  "ContainsInsecureDeserialization",
  "ContainsHtml",
  "ContainsUnsafeArchive",
  "ContainsOleEmbeddedObject",
  "ContainsUnwantedAction",
] as const;

interface CloudmersiveAdvancedScanOptions {
  fileName: string;
  allowExecutables: boolean;
  allowInvalidFiles: boolean;
  allowScripts: boolean;
  allowPasswordProtectedFiles: boolean;
  allowMacros: boolean;
  allowXmlExternalEntities: boolean;
  allowInsecureDeserialization: boolean;
  allowHtml: boolean;
  allowUnsafeArchives: boolean;
  allowOleEmbeddedObject: boolean;
  allowUnwantedAction: boolean;
  options: string;
  restrictFileTypes: string;
}

interface CloudmersiveScanApi {
  scanFileAdvanced: (
    inputFile: Buffer,
    options: CloudmersiveAdvancedScanOptions,
    callback: (error: unknown, data: unknown) => void,
  ) => unknown;
}

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
  malwareScanEnabled?: boolean;
  onSafetyChecksPassed?: (sha256: string, scanStatus: "clean" | "skipped") => Promise<void>;
}) {
  validateMagicBytes(input.bytes, input.contentType);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const malwareScanEnabled = input.malwareScanEnabled ?? isCloudmersiveMalwareScanEnabled();
  const scan = malwareScanEnabled
    ? await scanForMalware({
        bytes: input.bytes,
        contentType: input.contentType,
        originalName: input.originalName,
      })
    : ({ verdict: "skipped", provider: "builtin", signature: "cloudmersive_disabled" } as const);
  if (scan.verdict === "infected") {
    throw new CvProcessingError("malware_detected", "The malware scanner rejected the document.");
  }
  const scanStatus = scan.verdict === "clean" ? ("clean" as const) : ("skipped" as const);
  await input.onSafetyChecksPassed?.(sha256, scanStatus);

  const extracted =
    input.contentType === "application/pdf"
      ? await extractPdfText(input.bytes)
      : await extractDocxText(input.bytes);
  const normalizedText = extracted.text.replace(/\u0000/g, "").slice(0, MAX_PARSED_TEXT);
  return {
    sha256,
    scan,
    scanStatus,
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

export async function scanForMalware(
  input: {
    bytes: Buffer;
    contentType: string;
    originalName: string;
  },
  dependencies: { apiKey?: string; scanApi?: CloudmersiveScanApi } = {},
) {
  const apiKey = dependencies.apiKey ?? getCloudmersiveEnvironment()?.CLOUDMERSIVE_API_KEY;
  if (!apiKey) {
    throw new CvProcessingError(
      "malware_scanner_unavailable",
      "Cloudmersive must be configured before CV parsing is enabled.",
    );
  }

  const scanApi = dependencies.scanApi ?? createCloudmersiveScanApi(apiKey);
  let response: unknown;
  try {
    response = await new Promise((resolve, reject) => {
      scanApi.scanFileAdvanced(input.bytes, cloudmersiveScanOptions(input.originalName), (error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });
  } catch {
    throw new CvProcessingError("malware_scanner_error", "The malware scanner could not be reached.");
  }

  const parsed = cloudmersiveResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new CvProcessingError("malware_scanner_invalid_response", "The malware scanner response was invalid.");
  }

  const signatures = [
    ...(parsed.data.FoundViruses ?? []).map((virus) => virus.VirusName),
    ...cloudmersiveThreatFlags.filter((flag) => parsed.data[flag] === true),
  ];
  const unsafe = !parsed.data.CleanResult || signatures.length > 0;
  return {
    verdict: unsafe ? ("infected" as const) : ("clean" as const),
    provider: "cloudmersive",
    ...(unsafe ? { signature: signatures.join(", ").slice(0, 160) || "unsafe_content" } : {}),
  };
}

function createCloudmersiveScanApi(apiKey: string): CloudmersiveScanApi {
  const client = CloudmersiveVirusApiClient.ApiClient.instance;
  client.basePath = "https://api.cloudmersive.com";
  client.authentications.Apikey.apiKey = apiKey;
  client.timeout = 30_000;
  return new CloudmersiveVirusApiClient.ScanApi(client as never) as unknown as CloudmersiveScanApi;
}

function cloudmersiveScanOptions(originalName: string): CloudmersiveAdvancedScanOptions {
  return {
    fileName: originalName,
    allowExecutables: false,
    allowInvalidFiles: false,
    allowScripts: false,
    allowPasswordProtectedFiles: false,
    allowMacros: false,
    allowXmlExternalEntities: false,
    allowInsecureDeserialization: false,
    allowHtml: false,
    allowUnsafeArchives: false,
    allowOleEmbeddedObject: false,
    allowUnwantedAction: false,
    options: "blockOfficeXmlOleEmbeddedFile,blockInvalidUris",
    restrictFileTypes: ".pdf,.docx",
  };
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
