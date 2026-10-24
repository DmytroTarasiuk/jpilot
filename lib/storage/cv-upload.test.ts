import { describe, expect, it } from "vitest";
import { cvUploadRequestSchema } from "./cv-upload";

describe("CV upload metadata", () => {
  it("accepts a matching PDF", () => {
    expect(
      cvUploadRequestSchema.safeParse({
        fileName: "Dmytro-CV.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      }).success,
    ).toBe(true);
  });

  it("rejects path-like names and mismatched extensions", () => {
    for (const fileName of ["../resume.pdf", "resume.pdf:payload", "resume.docx"]) {
      expect(
        cvUploadRequestSchema.safeParse({
          fileName,
          contentType: "application/pdf",
          sizeBytes: 1024,
        }).success,
      ).toBe(false);
    }
  });
});
