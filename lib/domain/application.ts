import { z } from "zod";
import type { ApplicationSourceFact, ScreeningAnswerDraft } from "../db/schema";
import { sha256 } from "./job";

const screeningAnswerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().max(2_000).nullable(),
  sourceFactIds: z.array(z.string().trim().min(1).max(160)).max(20),
  needsReview: z.boolean(),
});

export const applicationDraftInputSchema = z.object({
  coverLetter: z.string().trim().max(12_000),
  screeningAnswers: z.array(screeningAnswerSchema).max(50),
});

export const applicationDecisionInputSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1_000).optional(),
  requestId: z.string().trim().min(8).max(128),
});

export const bulkApplicationDecisionInputSchema = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(50),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1_000).optional(),
  requestId: z.string().trim().min(8).max(128),
});

export const applicationStatusCorrectionInputSchema = z.object({
  status: z.enum([
    "submitted",
    "acknowledged",
    "interview",
    "rejected",
    "offer",
    "withdrawn",
    "outcome_unknown",
    "dismissed",
  ]),
  reason: z.string().trim().max(1_000).optional(),
  requestId: z.string().trim().min(8).max(128),
});

export function renderGroundedCoverLetter(input: {
  candidateName: string | null;
  roleTitle: string;
  company: string;
  facts: ApplicationSourceFact[];
}) {
  const confirmedProfile = input.facts.filter((fact) => fact.source === "confirmed_profile");
  const headline = confirmedProfile.find((fact) => fact.id === "profile:headline")?.value;
  const targetTitles = confirmedProfile.find((fact) => fact.id === "profile:target_titles")?.value;
  const languages = confirmedProfile.find((fact) => fact.id === "profile:languages")?.value;
  const workModes = confirmedProfile.find((fact) => fact.id === "profile:work_modes")?.value;
  const paragraphs = [
    `Dear ${input.company} hiring team,`,
    `I am interested in the ${input.roleTitle} opportunity at ${input.company}.`,
  ];

  const confirmedStatements = [
    headline ? `My confirmed professional headline is ${headline}.` : null,
    targetTitles ? `My confirmed target roles include ${targetTitles}.` : null,
    languages ? `My confirmed languages are ${languages}.` : null,
    workModes ? `My confirmed work-mode preferences are ${workModes}.` : null,
  ].filter((value): value is string => Boolean(value));
  if (confirmedStatements.length > 0) paragraphs.push(confirmedStatements.join(" "));

  paragraphs.push(
    "I would welcome the opportunity to discuss the role. Please review my attached CV for the complete, confirmed details of my experience.",
    input.candidateName ? `Kind regards,\n${input.candidateName}` : "Kind regards,",
  );
  return paragraphs.join("\n\n");
}

export function groundingFingerprint(input: {
  sourceCvDocumentId: string | null;
  facts: ApplicationSourceFact[];
  screeningAnswers: ScreeningAnswerDraft[];
}) {
  return sha256(
    JSON.stringify({
      sourceCvDocumentId: input.sourceCvDocumentId,
      facts: [...input.facts].sort((left, right) => left.id.localeCompare(right.id)),
      screeningAnswers: input.screeningAnswers,
    }),
  );
}

