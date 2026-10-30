import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { listSupportGrants } from "@jobpilot/db/support";
import { LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { grantSupportAccess, revokeSupportAccess } from "./actions";

export default async function SupportPage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  if (identity.role !== "owner" && identity.role !== "admin") {
    return <div className="rounded-2xl border border-[#d9e2dc] bg-white p-8"><LockKeyholeIcon className="size-6" /><h1 className="mt-4 text-2xl font-semibold">Workspace admin access required</h1><p className="mt-2 text-[#68776f]">Only owners and admins can grant diagnostic access.</p></div>;
  }
  const grants = await listSupportGrants(identity);
  return (
    <div className="max-w-4xl">
      <p className="text-sm font-medium text-[#5f7067]">Administration</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Support access</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">Grant temporary, read-only diagnostics access. Support cannot impersonate users, read CV contents, or perform application actions.</p>
      <form action={grantSupportAccess} className="mt-8 grid gap-4 rounded-2xl border border-[#d9e2dc] bg-white p-5 sm:grid-cols-2">
        <label className="text-sm font-medium">Support principal<input className="mt-2 w-full rounded-xl border px-3 py-2.5" name="supportPrincipal" placeholder="engineer@jobpilot" required /></label>
        <label className="text-sm font-medium">Expires after<select className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" defaultValue="24" name="durationHours"><option value="1">1 hour</option><option value="8">8 hours</option><option value="24">24 hours</option><option value="72">72 hours</option></select></label>
        <label className="text-sm font-medium sm:col-span-2">Reason<textarea className="mt-2 min-h-24 w-full rounded-xl border px-3 py-2.5" name="reason" placeholder="Investigate failed DOU connector run..." required /></label>
        <button className="w-fit rounded-full bg-[#153f2e] px-4 py-2 text-sm font-semibold text-white" type="submit"><span className="inline-flex items-center gap-2"><ShieldCheckIcon className="size-4" />Grant diagnostics access</span></button>
      </form>
      <section className="mt-6 space-y-3" aria-label="Support grants">{grants.length === 0 ? <p className="rounded-2xl border border-[#d9e2dc] bg-white p-6 text-sm text-[#748078]">No support access has been granted.</p> : grants.map((grant) => {
        const active = !grant.revokedAt && grant.expiresAt > new Date();
        return <article className="rounded-2xl border border-[#d9e2dc] bg-white p-5" key={grant.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{grant.supportPrincipal}</p><p className="mt-1 text-sm text-[#68776f]">{grant.reason}</p><p className="mt-2 text-xs text-[#8a948e]">Diagnostics only · expires {grant.expiresAt.toLocaleString("en-GB")}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-emerald-50 text-emerald-700" : "bg-[#f0f2ef] text-[#68736d]"}`}>{active ? "active" : grant.revokedAt ? "revoked" : "expired"}</span></div>{active ? <form action={revokeSupportAccess} className="mt-4"><input name="grantId" type="hidden" value={grant.id} /><button className="text-sm font-semibold text-red-700" type="submit">Revoke access</button></form> : null}</article>;
      })}</section>
    </div>
  );
}
