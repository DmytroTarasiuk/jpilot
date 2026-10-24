import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { listOwnedCvDocuments } from "@jobpilot/db/cv-documents";
import { getCandidateProfile } from "@jobpilot/db/profiles";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm, type ProfileFormValue } from "../profile/profile-form";
import { CvUploader } from "./uploader";

export const metadata: Metadata = { title: "CV" };

export default async function CvPage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  const [documents, profile] = await Promise.all([
    listOwnedCvDocuments({ ...identity, limit: 10 }),
    getCandidateProfile(identity),
  ]);
  const review = documents.find((document) => document.processingStatus === "awaiting_confirmation");
  const initial: ProfileFormValue | null = review
    ? {
        displayName: review.extractedProfile?.displayName ?? profile?.displayName ?? "",
        headline: review.extractedProfile?.headline ?? profile?.headline ?? "",
        targetCountries: profile?.targetCountries ?? ["PL", "UA"],
        targetTitles: profile?.targetTitles ?? [],
        workModes: profile?.workModes ?? ["remote", "hybrid"],
        languages: review.extractedProfile?.languages.length
          ? review.extractedProfile.languages
          : profile?.languages ?? [],
        excludedCompanies: profile?.excludedCompanies ?? [],
        salaryMin: profile?.salaryMin ?? null,
        salaryCurrency: (profile?.salaryCurrency ?? "PLN") as ProfileFormValue["salaryCurrency"],
        salaryPeriod: (profile?.salaryPeriod ?? "monthly") as ProfileFormValue["salaryPeriod"],
      }
    : null;

  return (
    <div className="max-w-4xl">
      <p className="text-sm font-medium text-[#5f7067]">Candidate data</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Your CV</h1>
      <p className="mt-3 text-[#68776f]">
        Upload the version used for matching and applications. Files remain private and downloads use short-lived links.
      </p>
      <div className="mt-8">
        <CvUploader />
      </div>
      {review && initial ? (
        <section className="mt-8">
          <div className="rounded-2xl border border-[#c8d7ce] bg-[#f8fbf8] p-6">
            <p className="text-sm font-medium text-[#42634f]">Review required</p>
            <h2 className="mt-1 text-xl font-semibold">Confirm extracted candidate facts</h2>
            <p className="mt-2 text-sm leading-6 text-[#68776f]">
              Parsing creates suggestions only. Edit every field as needed; nothing becomes active until you confirm it.
            </p>
            {review.extractedProfile?.warnings.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">
                {review.extractedProfile.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : null}
          </div>
          <div className="mt-5">
            <ProfileForm
              initial={initial}
              method="POST"
              submitLabel="Confirm profile and activate CV"
              submitUrl={`/api/cv/documents/${review.id}/confirm`}
            />
          </div>
        </section>
      ) : null}
      <section className="mt-8 rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <h2 className="font-semibold">Document history</h2>
        {documents.length ? (
          <div className="mt-4 divide-y divide-[#e7ece8]">
            {documents.map((document) => (
              <article className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={document.id}>
                <div>
                  <p className="font-medium">{document.originalName}</p>
                  <p className="mt-1 text-xs text-[#748078]">
                    {(document.sizeBytes / 1024).toFixed(0)} KB · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(document.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge label={document.scanStatus.replaceAll("_", " ")} tone={document.scanStatus === "clean" ? "good" : document.scanStatus === "infected" || document.scanStatus === "error" ? "bad" : "neutral"} />
                  <StatusBadge label={document.processingStatus.replaceAll("_", " ")} tone={document.processingStatus === "confirmed" ? "good" : document.processingStatus === "failed" ? "bad" : "neutral"} />
                  {document.isActive ? <StatusBadge label="active" tone="good" /> : null}
                </div>
                {document.processingErrorCode ? <p className="text-xs text-red-700">{humanizeProcessingError(document.processingErrorCode)}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#748078]">No CV has been uploaded.</p>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "good" | "bad" | "neutral" }) {
  const toneClass = tone === "good" ? "bg-emerald-50 text-emerald-800" : tone === "bad" ? "bg-red-50 text-red-800" : "bg-[#f0f2ef] text-[#68736d]";
  return <span className={`rounded-full px-2.5 py-1 font-medium capitalize ${toneClass}`}>{label}</span>;
}

function humanizeProcessingError(code: string) {
  if (code === "malware_scanner_unavailable") return "Cloudmersive scanning is enabled but its API key is not configured.";
  if (code === "malware_detected") return "The scanner quarantined this document.";
  return `Processing stopped: ${code.replaceAll("_", " ")}.`;
}
