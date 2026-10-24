import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { getCandidateProfile } from "@jobpilot/db/profiles";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm, type ProfileFormValue } from "./profile-form";

export const metadata: Metadata = { title: "Candidate profile" };

const emptyProfile: ProfileFormValue = {
  displayName: "",
  headline: "",
  targetCountries: ["PL", "UA"],
  targetTitles: [],
  workModes: ["remote", "hybrid"],
  languages: [],
  excludedCompanies: [],
  salaryMin: null,
  salaryCurrency: "PLN",
  salaryPeriod: "monthly",
};

export default async function ProfilePage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  const profile = await getCandidateProfile(identity);
  const initial: ProfileFormValue = profile
    ? {
        displayName: profile.displayName ?? "",
        headline: profile.headline ?? "",
        targetCountries: profile.targetCountries,
        targetTitles: profile.targetTitles,
        workModes: profile.workModes,
        languages: profile.languages,
        excludedCompanies: profile.excludedCompanies,
        salaryMin: profile.salaryMin,
        salaryCurrency: profile.salaryCurrency as ProfileFormValue["salaryCurrency"],
        salaryPeriod: profile.salaryPeriod as ProfileFormValue["salaryPeriod"],
      }
    : emptyProfile;

  return (
    <div className="max-w-4xl">
      <p className="text-sm font-medium text-[#5f7067]">Candidate data</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Search profile</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">
        These confirmed preferences control eligibility and matching. The assistant must not invent missing facts.
      </p>
      <div className="mt-8"><ProfileForm initial={initial} /></div>
    </div>
  );
}
