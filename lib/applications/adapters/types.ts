import type { PlatformKey, ScreeningAnswerDraft } from "../../db/schema";

export interface DirectSubmissionRequest {
  applicationId: string;
  idempotencyKey: string;
  roleTitle: string;
  company: string;
  applicationUrl: string;
  cvDocumentId: string | null;
  coverLetter: string;
  screeningAnswers: ScreeningAnswerDraft[];
}

export interface DirectSubmissionReceipt {
  externalApplicationId: string;
  submittedAt: string;
  safeReceipt: Record<string, unknown>;
}

export interface DirectSubmissionAdapter {
  platform: PlatformKey;
  capability: "permitted_direct_submit";
  supportsProviderIdempotency: true;
  submit(request: DirectSubmissionRequest): Promise<DirectSubmissionReceipt>;
}

export class SubmissionOutcomeUnknownError extends Error {
  readonly outcomeUnknown = true;

  constructor(message = "submission_outcome_unknown") {
    super(message);
    this.name = "SubmissionOutcomeUnknownError";
  }
}

