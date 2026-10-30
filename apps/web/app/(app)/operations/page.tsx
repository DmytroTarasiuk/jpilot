import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { getOperationalSnapshot } from "@jobpilot/db/governance";
import { ActivityIcon, GaugeIcon, LockKeyholeIcon, ShieldAlertIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { saveGovernancePolicy } from "./actions";

export default async function OperationsPage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  if (identity.role !== "owner" && identity.role !== "admin") {
    return <div className="rounded-2xl border border-[#d9e2dc] bg-white p-8"><LockKeyholeIcon className="size-6" /><h1 className="mt-4 text-2xl font-semibold">Workspace admin access required</h1><p className="mt-2 text-[#68776f]">Only owners and admins can change retention and budget controls.</p></div>;
  }
  const snapshot = await getOperationalSnapshot(identity.tenantId);
  const metrics = [
    ["Search runs this month", snapshot.usage.searchRuns, snapshot.policy.monthlySearchRunLimit],
    ["Emails this month", snapshot.usage.emailsSent, snapshot.policy.monthlyEmailLimit],
    ["Failed runs (24h)", snapshot.health.failedRuns24h, null],
    ["Overdue schedules", snapshot.health.overdueSchedules, null],
  ] as const;

  return (
    <div className="max-w-5xl">
      <p className="text-sm font-medium text-[#5f7067]">Administration</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Operations and governance</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">Hard run caps are enforced before workflow dispatch. Email caps are enforced before provider calls. UTC calendar months define budget periods.</p>

      <section aria-label="Operational health" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value, limit]) => <article className="rounded-2xl border border-[#d9e2dc] bg-white p-5" key={label}><p className="text-sm text-[#68776f]">{label}</p><p className="mt-2 text-3xl font-semibold">{value}{limit === null ? "" : ` / ${limit}`}</p></article>)}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-[#d9e2dc] bg-white p-5"><ActivityIcon className="size-5 text-[#27563f]" /><h2 className="mt-3 font-semibold">Connector circuits</h2><p className="mt-2 text-sm text-[#68776f]">{snapshot.health.openConnectors.length === 0 ? "All connector circuits are closed." : `${snapshot.health.openConnectors.length} connector circuit(s) are open.`}</p></article>
        <article className="rounded-2xl border border-[#d9e2dc] bg-white p-5"><ShieldAlertIcon className="size-5 text-[#27563f]" /><h2 className="mt-3 font-semibold">Email delivery</h2><p className="mt-2 text-sm text-[#68776f]">{snapshot.health.failedEmailDeliveries} delivery attempt(s) currently require retry or investigation.</p></article>
      </section>

      <form action={saveGovernancePolicy} className="mt-6 rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <div className="flex items-start gap-3"><GaugeIcon className="mt-0.5 size-5 text-[#27563f]" /><div><h2 className="text-lg font-semibold">Retention and cost controls</h2><p className="mt-1 text-sm text-[#68776f]">Retention cleanup runs with the authenticated dispatcher. Minimum audit retention is one year.</p></div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField defaultValue={snapshot.policy.sourceSnapshotRetentionDays} label="Source snapshots (days)" max={365} min={30} name="sourceSnapshotRetentionDays" />
          <NumberField defaultValue={snapshot.policy.notificationRetentionDays} label="Notifications (days)" max={730} min={30} name="notificationRetentionDays" />
          <NumberField defaultValue={snapshot.policy.auditRetentionDays} label="Audit events (days)" max={2555} min={365} name="auditRetentionDays" />
          <NumberField defaultValue={snapshot.policy.monthlySearchRunLimit} label="Monthly search runs" max={1000000} min={1} name="monthlySearchRunLimit" />
          <NumberField defaultValue={snapshot.policy.monthlyEmailLimit} label="Monthly emails" max={1000000} min={0} name="monthlyEmailLimit" />
          <NumberField defaultValue={snapshot.policy.budgetWarningPercent} label="Warn at (%)" max={100} min={50} name="budgetWarningPercent" />
        </div>
        <label className="mt-5 flex items-start gap-3 text-sm"><input className="mt-1" defaultChecked={snapshot.policy.hardStopSearchRuns} name="hardStopSearchRuns" type="checkbox" /><span>Stop new search runs when the monthly limit is reached. Scheduled occurrences are recorded as cancelled and advance safely.</span></label>
        <button className="mt-5 rounded-full bg-[#153f2e] px-4 py-2 text-sm font-semibold text-white" type="submit">Save governance policy</button>
      </form>
    </div>
  );
}

function NumberField({ defaultValue, label, max, min, name }: { defaultValue: number; label: string; max: number; min: number; name: string }) {
  return <label className="text-sm font-medium">{label}<input className="mt-2 w-full rounded-xl border px-3 py-2.5" defaultValue={defaultValue} max={max} min={min} name={name} required step="1" type="number" /></label>;
}
