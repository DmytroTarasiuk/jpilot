import { afterEach, describe, expect, it, vi } from "vitest";
import { isCloudmersiveMalwareScanEnabled } from "../env/server";
import { inspectAndExtractCv, scanForMalware } from "./cv-processing";

const scanInput = {
  bytes: Buffer.from("test document"),
  contentType: "application/pdf",
  originalName: "resume.pdf",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Cloudmersive CV malware scanning", () => {
  it("keeps malware scanning disabled unless explicitly enabled", () => {
    const previous = process.env.CV_MALWARE_SCAN_ENABLED;
    delete process.env.CV_MALWARE_SCAN_ENABLED;
    try {
      expect(isCloudmersiveMalwareScanEnabled()).toBe(false);
      process.env.CV_MALWARE_SCAN_ENABLED = "true";
      expect(isCloudmersiveMalwareScanEnabled()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CV_MALWARE_SCAN_ENABLED;
      else process.env.CV_MALWARE_SCAN_ENABLED = previous;
    }
  });

  it("uses strict advanced scanning and accepts a clean document", async () => {
    let receivedOptions: unknown;
    const result = await scanForMalware(scanInput, {
      apiKey: "test-api-key-with-safe-length",
      scanApi: {
        scanFileAdvanced(bytes, options, callback) {
          expect(bytes).toEqual(scanInput.bytes);
          receivedOptions = options;
          callback(null, { CleanResult: true, FoundViruses: [] });
        },
      },
    });

    expect(result).toEqual({ verdict: "clean", provider: "cloudmersive" });
    expect(receivedOptions).toMatchObject({
      fileName: "resume.pdf",
      allowExecutables: false,
      allowInvalidFiles: false,
      allowScripts: false,
      allowPasswordProtectedFiles: false,
      allowMacros: false,
      allowUnsafeArchives: false,
      restrictFileTypes: ".pdf,.docx",
    });
  });

  it("rejects malware and preserves a bounded diagnostic signature", async () => {
    const result = await scanForMalware(scanInput, {
      apiKey: "test-api-key-with-safe-length",
      scanApi: {
        scanFileAdvanced(_bytes, _options, callback) {
          callback(null, {
            CleanResult: false,
            FoundViruses: [{ FileName: "resume.pdf", VirusName: "EICAR-Test-File" }],
            ContainsScript: true,
          });
        },
      },
    });

    expect(result).toEqual({
      verdict: "infected",
      provider: "cloudmersive",
      signature: "EICAR-Test-File, ContainsScript",
    });
  });

  it("fails closed when Cloudmersive is unavailable or returns malformed data", async () => {
    const unavailable = scanForMalware(scanInput, {
      apiKey: "test-api-key-with-safe-length",
      scanApi: {
        scanFileAdvanced(_bytes, _options, callback) {
          callback(new Error("network failure"), null);
        },
      },
    });
    await expect(unavailable).rejects.toMatchObject({ code: "malware_scanner_error" });

    const invalid = scanForMalware(scanInput, {
      apiKey: "test-api-key-with-safe-length",
      scanApi: {
        scanFileAdvanced(_bytes, _options, callback) {
          callback(null, { message: "unexpected response" });
        },
      },
    });
    await expect(invalid).rejects.toMatchObject({
      code: "malware_scanner_invalid_response",
    });
  });

  it("blocks scanning when the API key is not configured", async () => {
    vi.stubEnv("CLOUDMERSIVE_API_KEY", "");

    await expect(scanForMalware(scanInput)).rejects.toMatchObject({
      code: "malware_scanner_unavailable",
    });
  });

  it("keeps built-in signature checks active when malware scanning is disabled", async () => {
    await expect(
      inspectAndExtractCv({
        bytes: Buffer.from("not a PDF"),
        contentType: "application/pdf",
        originalName: "resume.pdf",
        malwareScanEnabled: false,
      }),
    ).rejects.toMatchObject({ code: "content_signature_mismatch" });
  });
});
