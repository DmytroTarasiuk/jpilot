import type { Metadata } from "next";
import { ScheduleBuilder } from "./schedule-builder";

export const metadata: Metadata = { title: "Search schedule" };

export default function SchedulePage() {
  return (
    <div className="max-w-4xl">
      <p className="text-sm font-medium text-[#5f7067]">Automation</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Search schedule</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">
        Pick the market, sources, and reasonable per-platform limits. Auto-apply remains off in this foundation release.
      </p>
      <div className="mt-8">
        <ScheduleBuilder />
      </div>
    </div>
  );
}
