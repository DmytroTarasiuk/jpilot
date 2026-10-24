import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { getDashboardSummary } from "@jobpilot/db/dashboard";
import { listSearchRuns } from "@jobpilot/db/search-runs";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  FileSearchIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RunNowButton } from "./run-now-button";

function formatDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
}

const runLabels: Record<string, string> = {
  partially_completed: "Waiting for integration",
  leased: "Preparing",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default async function DashboardPage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  const [summary, runs] = await Promise.all([
    getDashboardSummary(identity),
    listSearchRuns({ ...identity, limit: 5 }),
  ]);
  const metrics = [
    ["Proposed", summary.metrics.proposed, "New roles awaiting review", FileSearchIcon],
    ["Approval needed", summary.metrics.approvalRequired, "Applications paused for you", CircleAlertIcon],
    ["Submitted", summary.metrics.submitted, "Applications with a receipt", CheckCircle2Icon],
  ] as const;
  const onboarding = [
    ["Confirm your profile and CV", "Review extracted details before activation", "/cv", summary.onboarding.profile && summary.onboarding.cv],
    ["Choose countries and limits", "Poland, Ukraine, and per-platform caps", "/schedule", summary.onboarding.schedule],
    ["Connect a job platform", "Capabilities are verified per platform", "/integrations", summary.onboarding.integration],
  ] as const;
  const completedOnboarding = onboarding.filter((item) => item[3]).length;

  return (
    <>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#5f7067]">Job search workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Search control center</h1>
          <p className="mt-3 max-w-2xl text-[#68776f]">Configure your profile, connect permitted sources, and review every proposed action.</p>
        </div>
        <RunNowButton scheduleId={summary.nextSchedule?.id ?? null} />
      </div>

      <section aria-label="Application summary" className="mt-8 grid gap-4 md:grid-cols-3">
        {metrics.map(([label, value, description, Icon]) => (
          <article className="rounded-2xl border border-[#dce4df] bg-white p-5" key={label}>
            <div className="flex items-start justify-between">
              <div><p className="text-sm text-[#68776f]">{label}</p><p className="mt-2 text-4xl font-semibold tracking-tight">{value}</p></div>
              <span className="grid size-10 place-items-center rounded-xl bg-[#eef3ee] text-[#27563f]"><Icon className="size-5" /></span>
            </div>
            <p className="mt-5 text-sm text-[#7b8881]">{description}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <article className="rounded-2xl border border-[#dce4df] bg-white p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-[#68776f]">Onboarding</p><h2 className="mt-1 text-xl font-semibold">Prepare your first controlled run</h2></div>
            <span className="rounded-full bg-[#edf2ec] px-3 py-1 text-xs font-semibold text-[#4b6054]">{completedOnboarding} / 3</span>
          </div>
          <div className="mt-6 divide-y divide-[#e6ebe7]">
            {onboarding.map(([title, description, href, complete], index) => (
              <Link className="flex items-center gap-4 py-4 first:pt-0 last:pb-0" href={href} key={title}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${complete ? "border-[#7ba58b] bg-[#e3f0e6] text-[#27563f]" : "border-[#cad6cf] text-[#456052]"}`}>
                  {complete ? <CheckCircle2Icon className="size-4" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="mt-1 block text-sm text-[#78857e]">{description}</span></span>
                <ArrowUpRightIcon className="size-4 text-[#75847c]" />
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-2xl bg-[#dfff79] p-6 text-[#182015]">
          <CalendarClockIcon className="size-6" />
          <p className="mt-8 text-sm font-medium text-[#50602f]">Next run</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            {summary.nextSchedule ? formatDate(summary.nextSchedule.nextRunAt, summary.nextSchedule.timezone) : "Not scheduled"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#536238]">
            {summary.nextSchedule?.desiredEnabled && !summary.nextSchedule.enabled
              ? "Ready when a permitted discovery integration is connected."
              : "Daily runs inspect the previous local calendar day. Weekly runs inspect the previous seven."}
          </p>
          <Link className="mt-6 inline-flex items-center gap-2 text-sm font-semibold" href="/schedule">Configure schedule <ArrowUpRightIcon className="size-4" /></Link>
        </article>
      </section>

      <section className="mt-6 rounded-2xl border border-[#dce4df] bg-white p-6">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-sm text-[#68776f]">Run history</p><h2 className="mt-1 text-xl font-semibold">Recent searches</h2></div>
          <Link className="text-sm font-semibold text-[#27563f]" href="/schedule">Manage runs</Link>
        </div>
        {runs.length === 0 ? <p className="mt-5 text-sm text-[#78857e]">No searches have been queued yet.</p> : (
          <div className="mt-5 divide-y divide-[#e6ebe7]">
            {runs.map((run) => (
              <div className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center" key={run.id}>
                <div><p className="font-medium">{run.scheduleName ?? "Deleted schedule"}</p><p className="mt-1 text-sm text-[#78857e]">{formatDate(run.windowStart, "UTC")} – {formatDate(run.windowEnd, "UTC")}</p></div>
                <span className="w-fit rounded-full bg-[#edf2ec] px-3 py-1 text-xs font-semibold text-[#4b6054]">{runLabels[run.status] ?? run.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
