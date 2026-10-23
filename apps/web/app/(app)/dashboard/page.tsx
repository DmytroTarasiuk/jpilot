import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  FileSearchIcon,
  PlayIcon,
} from "lucide-react";
import Link from "next/link";

const metrics = [
  ["Proposed", "0", "New roles awaiting review", FileSearchIcon],
  ["Approval needed", "0", "Applications paused for you", CircleAlertIcon],
  ["Submitted", "0", "Applications with a receipt", CheckCircle2Icon],
] as const;

export default function DashboardPage() {
  return (
    <>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#5f7067]">Job search workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Search control center</h1>
          <p className="mt-3 max-w-2xl text-[#68776f]">
            Configure your profile, connect permitted sources, and review every proposed action.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#153f2e] px-5 py-3 text-sm font-semibold text-white opacity-60"
          disabled
          title="Available after the first schedule is configured"
          type="button"
        >
          <PlayIcon className="size-4" /> Run search
        </button>
      </div>

      <section aria-label="Application summary" className="mt-8 grid gap-4 md:grid-cols-3">
        {metrics.map(([label, value, description, Icon]) => (
          <article className="rounded-2xl border border-[#dce4df] bg-white p-5" key={label}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-[#68776f]">{label}</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight">{value}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-[#eef3ee] text-[#27563f]">
                <Icon className="size-5" />
              </span>
            </div>
            <p className="mt-5 text-sm text-[#7b8881]">{description}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <article className="rounded-2xl border border-[#dce4df] bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#68776f]">Onboarding</p>
              <h2 className="mt-1 text-xl font-semibold">Prepare your first controlled run</h2>
            </div>
            <span className="rounded-full bg-[#edf2ec] px-3 py-1 text-xs font-semibold text-[#4b6054]">0 / 3</span>
          </div>
          <div className="mt-6 divide-y divide-[#e6ebe7]">
            {[
              ["Upload your current CV", "PDF or DOCX, stored privately", "/cv"],
              ["Choose countries and limits", "Poland, Ukraine, and per-platform caps", "/schedule"],
              ["Connect a job platform", "Capabilities are verified per platform", "/integrations"],
            ].map(([title, description, href], index) => (
              <Link className="flex items-center gap-4 py-4 first:pt-0 last:pb-0" href={href} key={title}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#cad6cf] text-sm font-semibold text-[#456052]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{title}</span>
                  <span className="mt-1 block text-sm text-[#78857e]">{description}</span>
                </span>
                <ArrowUpRightIcon className="size-4 text-[#75847c]" />
              </Link>
            ))}
          </div>
        </article>

        <article className="rounded-2xl bg-[#dfff79] p-6 text-[#182015]">
          <CalendarClockIcon className="size-6" />
          <p className="mt-8 text-sm font-medium text-[#50602f]">Next run</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Not scheduled</h2>
          <p className="mt-3 text-sm leading-6 text-[#536238]">
            Daily runs inspect the previous local calendar day. Weekly runs inspect the previous seven.
          </p>
          <Link className="mt-6 inline-flex items-center gap-2 text-sm font-semibold" href="/schedule">
            Configure schedule <ArrowUpRightIcon className="size-4" />
          </Link>
        </article>
      </section>
    </>
  );
}
