"use client";

import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { useRef, useState } from "react";

const sources = [
  ["linkedin", "LinkedIn"],
  ["just_join_it", "Just Join IT"],
  ["no_fluff_jobs", "No Fluff Jobs"],
  ["dou", "DOU"],
  ["djinni", "Djinni"],
] as const;

export function ScheduleBuilder() {
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [countries, setCountries] = useState<string[]>(["PL", "UA"]);
  const [platforms, setPlatforms] = useState<string[]>(["just_join_it", "no_fluff_jobs", "dou", "djinni"]);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw");
  const requestId = useRef(crypto.randomUUID());

  async function save(form: HTMLFormElement) {
    try {
      setState("saving");
      setMessage("");
      const values = new FormData(form);
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: requestId.current,
          name: String(values.get("name") || "My search"),
          cadence,
          timezone,
          localTime: String(values.get("localTime") || "08:00"),
          dayOfWeek: cadence === "weekly" ? Number(values.get("dayOfWeek")) : null,
          targetCountries: countries,
          platforms: platforms.map((platform) => ({ platform, searchLimit: 25, autoApplyLimit: 0 })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; enabled?: boolean; nextRunAt?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "The schedule could not be saved.");

      requestId.current = crypto.randomUUID();
      setState("saved");
      setMessage(
        payload?.enabled
          ? `Next run: ${new Date(payload.nextRunAt ?? "").toLocaleString()}`
          : "Schedule saved and paused until a discovery integration is connected.",
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The schedule could not be saved.");
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save(event.currentTarget);
      }}
    >
      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <h2 className="font-semibold">Timing</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Schedule name
            <input className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" defaultValue="Morning job search" name="name" />
          </label>
          <label className="text-sm font-medium">
            Local time
            <input className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" defaultValue="08:00" name="localTime" type="time" />
          </label>
          <label className="text-sm font-medium">
            Cadence
            <select className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" onChange={(event) => setCadence(event.target.value as "daily" | "weekly")} value={cadence}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          {cadence === "weekly" ? (
            <label className="text-sm font-medium">
              Day
              <select className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" defaultValue="1" name="dayOfWeek">
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
                <option value="0">Sunday</option>
              </select>
            </label>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-[#748078]">Timezone detected as {timezone}. Daily runs search the previous local calendar day.</p>
      </section>

      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <h2 className="font-semibold">Countries</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {[["PL", "Poland"], ["UA", "Ukraine"]].map(([code, label]) => (
            <label className="flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm" key={code}>
              <input
                checked={countries.includes(code)}
                onChange={(event) => setCountries((current) => event.target.checked ? [...current, code] : current.filter((item) => item !== code))}
                type="checkbox"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">Platforms</h2>
          <span className="text-xs text-[#748078]">25 results · 0 auto-apply each</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {sources.map(([id, label]) => (
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm" key={id}>
              <input
                checked={platforms.includes(id)}
                onChange={(event) => setPlatforms((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))}
                type="checkbox"
              />
              <span className="font-medium">{label}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          className="inline-flex items-center gap-2 rounded-full bg-[#153f2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={state === "saving" || countries.length === 0 || platforms.length === 0}
          type="submit"
        >
          {state === "saving" ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
          Save schedule
        </button>
        {message ? (
          <p className={`flex items-center gap-2 text-sm ${state === "error" ? "text-red-700" : "text-[#42634f]"}`}>
            {state === "saved" ? <CheckCircle2Icon className="size-4" /> : null}
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
