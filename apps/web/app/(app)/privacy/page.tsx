import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { getPrivacyState } from "@jobpilot/db/privacy";
import { DownloadIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { redirect } from "next/navigation";
import { savePrivacyConsent } from "./actions";
import { ErasureControl } from "./erasure-control";

export default async function PrivacyPage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  const state = await getPrivacyState(identity);
  const currentConsent = state.consents.at(-1);

  return (
    <div className="max-w-4xl">
      <p className="text-sm font-medium text-[#5f7067]">Account controls</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Privacy and data</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">
        Review processing consent, export portable account data, or request secure deletion. Provider credentials and internal storage keys are never included in exports.
      </p>

      <section className="mt-8 rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <div className="flex items-start gap-3"><ShieldCheckIcon className="mt-0.5 size-5 text-[#27563f]" /><div><h2 className="text-lg font-semibold">Job-search processing consent</h2><p className="mt-1 text-sm text-[#68776f]">Version {state.policyVersion}. Consent history is append-only and withdrawal does not erase earlier audit records.</p></div></div>
        <form action={savePrivacyConsent} className="mt-5">
          <label className="flex items-start gap-3 text-sm"><input className="mt-1" defaultChecked={currentConsent?.granted ?? false} name="granted" type="checkbox" /><span>I consent to JobPilot processing my confirmed profile and active CV to discover and match jobs. Application submission remains approval-gated.</span></label>
          <button className="mt-4 rounded-full bg-[#153f2e] px-4 py-2 text-sm font-semibold text-white" type="submit">Save consent choice</button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <div className="flex items-start gap-3"><DownloadIcon className="mt-0.5 size-5 text-[#27563f]" /><div><h2 className="text-lg font-semibold">Export your data</h2><p className="mt-1 text-sm text-[#68776f]">Download a tenant- and owner-scoped JSON export. The response is private and never cached.</p></div></div>
        <a className="mt-4 inline-flex rounded-full border border-[#9eb3a6] px-4 py-2 text-sm font-semibold text-[#27563f]" href="/api/privacy/export">Download JSON export</a>
      </section>

      <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3"><Trash2Icon className="mt-0.5 size-5 text-red-700" /><div><h2 className="text-lg font-semibold text-red-950">Delete workspace data</h2><p className="mt-1 text-sm text-red-800">Two-step confirmation removes user-owned JobPilot records and CV objects. Global public vacancy records and pseudonymous privacy request history may be retained.</p></div></div>
        <ErasureControl />
      </section>
    </div>
  );
}
