import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { listOwnedApplications, permittedUserStatusTargets } from "@jobpilot/db/applications";
import { redirect } from "next/navigation";
import { ApplicationBoard, type ApplicationView } from "./application-board";

export default async function ApplicationsPage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  const applications = await listOwnedApplications({ ...identity, limit: 100 });
  const views: ApplicationView[] = applications.map((application) => ({
    ...application,
    submittedAt: application.submittedAt?.toISOString() ?? null,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    publishedAt: application.publishedAt?.toISOString() ?? null,
    coverLetter: application.coverLetter ?? "",
    screeningAnswers: application.screeningAnswers ?? [],
    sourceFacts: application.sourceFacts ?? [],
    missingFacts: application.missingFacts ?? [],
    draftRevision: application.draftRevision ?? 0,
    generationMode: application.generationMode ?? "unavailable",
    canEditDraft: application.status === "approval_required" || application.status === "manual_required",
    allowedStatusTargets: permittedUserStatusTargets(application.status),
    events: application.events.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  }));

  return <ApplicationBoard initialApplications={views} />;
}
