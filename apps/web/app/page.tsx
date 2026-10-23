import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  FileCheck2Icon,
  RadarIcon,
  ShieldCheckIcon,
} from "lucide-react";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#f7f8f5] text-[#112018]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Link className="flex items-center gap-3 font-semibold tracking-tight" href="/">
          <span className="grid size-9 place-items-center rounded-xl bg-[#153f2e] text-white">
            <RadarIcon className="size-5" />
          </span>
          JobPilot
        </Link>
        <div className="flex items-center gap-3">
          <Link className="rounded-full px-4 py-2 text-sm font-medium hover:bg-white" href="/sign-in">
            Sign in
          </Link>
          <Link
            className="rounded-full bg-[#153f2e] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0e3022]"
            href="/sign-up"
          >
            Create workspace
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:pt-24">
        <div className="max-w-3xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#c9d8cf] bg-white px-3 py-1.5 text-sm text-[#355746]">
            <ShieldCheckIcon className="size-4" />
            Controlled automation for real applications
          </div>
          <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
            Find the right work. Keep every application under control.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[#516158] sm:text-xl">
            Search recent roles across Poland and Ukraine, remove duplicates, review strong matches,
            and track applications from discovery to offer.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center gap-2 rounded-full bg-[#dfff79] px-6 py-3.5 font-semibold text-[#142014] transition hover:bg-[#d4f36f]"
              href="/sign-up"
            >
              Start securely <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              className="rounded-full border border-[#ccd6d0] bg-white px-6 py-3.5 font-semibold transition hover:border-[#8aa396]"
              href="/sign-in"
            >
              Open dashboard
            </Link>
          </div>
        </div>

        <div className="relative rounded-[2rem] border border-[#dce4df] bg-[#153f2e] p-5 text-white shadow-2xl shadow-[#153f2e]/15 sm:p-7">
          <div className="absolute -right-8 -top-8 size-40 rounded-full bg-[#dfff79]/20 blur-3xl" />
          <div className="relative rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">Daily run</p>
                <p className="mt-1 text-lg font-semibold">Warsaw · Kyiv · Remote</p>
              </div>
              <span className="rounded-full bg-[#dfff79] px-3 py-1 text-xs font-bold text-[#153f2e]">08:00</span>
            </div>
            <div className="grid grid-cols-3 gap-3 py-6 text-center">
              {[
                ["42", "new roles"],
                ["9", "strong matches"],
                ["3", "need review"],
              ].map(([value, label]) => (
                <div className="rounded-xl bg-black/10 p-3" key={label}>
                  <p className="text-2xl font-semibold">{value}</p>
                  <p className="mt-1 text-xs text-white/55">{label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {[
                [FileCheck2Icon, "CV and facts stay private"],
                [CheckCircle2Icon, "No duplicate vacancies"],
                [ShieldCheckIcon, "Human approval by default"],
              ].map(([Icon, label]) => {
                const ItemIcon = Icon as typeof FileCheck2Icon;
                return (
                  <div className="flex items-center gap-3 rounded-xl bg-white/8 px-4 py-3" key={label as string}>
                    <ItemIcon className="size-5 text-[#dfff79]" />
                    <span className="text-sm text-white/85">{label as string}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
