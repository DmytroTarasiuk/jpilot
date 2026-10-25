import { FatalError } from "workflow";

export async function applicationSubmissionWorkflow(input: {
  tenantId: string;
  ownerId: string;
  applicationId: string;
}) {
  "use workflow";

  return submitApplicationStep(input);
}

async function submitApplicationStep(input: {
  tenantId: string;
  ownerId: string;
  applicationId: string;
}) {
  "use step";

  const [{ getOwnedApplicationForSubmission }, { getDirectSubmissionAdapter }, { submitApprovedApplication }] =
    await Promise.all([
      import("../lib/db/applications"),
      import("../lib/applications/adapters/registry"),
      import("../lib/applications/submission"),
    ]);
  const application = await getOwnedApplicationForSubmission(input);
  if (!application) throw new FatalError("application_not_found");
  const adapter = getDirectSubmissionAdapter(application.platform);
  if (!adapter) throw new FatalError(`direct_submission_adapter_unavailable:${application.platform}`);
  return submitApprovedApplication({ ...input, adapter });
}

submitApplicationStep.maxRetries = 2;

