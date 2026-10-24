"use client";

import {
  CalendarSearchIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

const sources = [
  ["linkedin", "LinkedIn"],
  ["just_join_it", "Just Join IT"],
  ["no_fluff_jobs", "No Fluff Jobs"],
  ["dou", "DOU"],
  ["djinni", "Djinni"],
] as const;
type Platform = (typeof sources)[number][0];

export interface ScheduleView {
  id: string;
  name: string;
  cadence: "daily" | "weekly";
  timezone: string;
  localTime: string;
  dayOfWeek: number | null;
  targetCountries: string[];
  desiredEnabled: boolean;
  enabled: boolean;
  nextRunAt: string;
  platforms: Array<{
    platform: Platform;
    searchLimit: number;
    autoApplyLimit: number;
  }>;
}

interface Draft {
  id: string | null;
  name: string;
  cadence: "daily" | "weekly";
  timezone: string;
  localTime: string;
  dayOfWeek: number;
  countries: string[];
  desiredEnabled: boolean;
  platforms: Record<Platform, { selected: boolean; searchLimit: number; autoApplyLimit: number }>;
}

interface Preview {
  nextRunAt: string;
  windowStart: string;
  windowEnd: string;
  timezone: string;
}

export function ScheduleBuilder({ initialSchedules }: { initialSchedules: ScheduleView[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => emptyDraft());
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const selectedPlatforms = sources.filter(([id]) => draft.platforms[id].selected);

  async function save() {
    setState("saving");
    setMessage("");
    const configuration = {
      name: draft.name,
      cadence: draft.cadence,
      timezone: draft.timezone,
      localTime: draft.localTime,
      dayOfWeek: draft.cadence === "weekly" ? draft.dayOfWeek : null,
      targetCountries: draft.countries,
      desiredEnabled: draft.desiredEnabled,
      platforms: selectedPlatforms.map(([platform]) => ({
        platform,
        searchLimit: draft.platforms[platform].searchLimit,
        autoApplyLimit: draft.platforms[platform].autoApplyLimit,
      })),
    };
    try {
      const response = await fetch(
        draft.id ? `/api/schedules/${draft.id}` : "/api/schedules",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            draft.id ? configuration : { requestId: crypto.randomUUID(), ...configuration },
          ),
        },
      );
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        pausedReason?: string | null;
      } | null;
      if (!response.ok) throw new Error(result?.error ?? "The schedule could not be saved.");
      setState("saved");
      setMessage(
        result?.pausedReason
          ? "Saved. It will activate automatically after a discovery integration is connected."
          : "Schedule saved.",
      );
      setDraft(emptyDraft());
      setPreview(null);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The schedule could not be saved.");
    }
  }

  async function loadPreview() {
    setMessage("");
    try {
      const response = await fetch("/api/schedules/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cadence: draft.cadence,
          timezone: draft.timezone,
          localTime: draft.localTime,
          dayOfWeek: draft.cadence === "weekly" ? draft.dayOfWeek : null,
        }),
      });
      const result = (await response.json().catch(() => null)) as (Preview & { error?: string }) | null;
      if (!response.ok || !result) throw new Error(result?.error ?? "Preview could not be calculated.");
      setPreview(result);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Preview could not be calculated.");
    }
  }

  async function runNow(scheduleId: string) {
    setBusyId(scheduleId);
    setMessage("");
    try {
      const response = await fetch("/api/search-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), scheduleId, lookbackDays: 1 }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "The run could not be queued.");
      setState("saved");
      setMessage("Manual run queued. Connected discovery sources will be processed.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The run could not be queued.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(scheduleId: string) {
    if (!window.confirm("Delete this schedule? Its historical runs will remain available.")) return;
    setBusyId(scheduleId);
    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "The schedule could not be deleted.");
      setState("saved");
      setMessage("Schedule deleted.");
      if (draft.id === scheduleId) setDraft(emptyDraft());
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The schedule could not be deleted.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      {initialSchedules.length ? (
        <section className="grid gap-4 md:grid-cols-2">
          {initialSchedules.map((schedule) => (
            <article className="rounded-2xl border border-[#d9e2dc] bg-white p-5" key={schedule.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{schedule.name}</p>
                  <p className="mt-1 text-sm text-[#748078]">
                    {schedule.cadence} · {schedule.localTime} · {schedule.timezone}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${schedule.enabled ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {schedule.enabled ? "Active" : schedule.desiredEnabled ? "Waiting for integration" : "Paused"}
                </span>
              </div>
              <p className="mt-4 text-sm text-[#5f7067]">
                Next occurrence: {formatDateTime(schedule.nextRunAt, schedule.timezone)}
              </p>
              <p className="mt-2 text-xs text-[#748078]">
                {schedule.platforms.length} platforms · {schedule.targetCountries.join(" + ")}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ActionButton disabled={busyId !== null} icon={PlayIcon} label="Run now" onClick={() => void runNow(schedule.id)} />
                <ActionButton disabled={busyId !== null} icon={PencilIcon} label="Edit" onClick={() => { setDraft(draftFromSchedule(schedule)); setPreview(null); }} />
                <ActionButton disabled={busyId !== null} icon={Trash2Icon} label="Delete" onClick={() => void remove(schedule.id)} />
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[#68776f]">{draft.id ? "Editing schedule" : "New schedule"}</p>
            <h2 className="mt-1 text-xl font-semibold">Timing and search window</h2>
          </div>
          {draft.id ? <button className="text-sm font-medium text-[#42634f]" onClick={() => setDraft(emptyDraft())} type="button">Cancel edit</button> : null}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextInput label="Schedule name" onChange={(name) => setDraft((current) => ({ ...current, name }))} value={draft.name} />
          <label className="text-sm font-medium">
            Local time
            <input className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" onChange={(event) => setDraft((current) => ({ ...current, localTime: event.target.value }))} type="time" value={draft.localTime} />
          </label>
          <label className="text-sm font-medium">
            Cadence
            <select className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" onChange={(event) => setDraft((current) => ({ ...current, cadence: event.target.value as Draft["cadence"] }))} value={draft.cadence}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          {draft.cadence === "weekly" ? (
            <label className="text-sm font-medium">
              Day
              <select className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" onChange={(event) => setDraft((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))} value={draft.dayOfWeek}>
                {[[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          ) : null}
          <label className="text-sm font-medium sm:col-span-2">
            IANA timezone
            <input className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" list="jobpilot-timezones" onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} value={draft.timezone} />
            <datalist id="jobpilot-timezones"><option value="Europe/Warsaw" /><option value="Europe/Kyiv" /><option value="Europe/Kiev" /></datalist>
          </label>
        </div>
        <button className="mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium" onClick={() => void loadPreview()} type="button">
          <CalendarSearchIcon className="size-4" /> Preview exact window
        </button>
        {preview ? (
          <div className="mt-4 rounded-xl bg-[#f2f6f2] p-4 text-sm leading-6 text-[#506158]">
            <p><strong>Next run:</strong> {formatDateTime(preview.nextRunAt, preview.timezone)}</p>
            <p><strong>Vacancies:</strong> {formatDateTime(preview.windowStart, preview.timezone)} → {formatDateTime(preview.windowEnd, preview.timezone)}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <h2 className="font-semibold">Countries</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {[["PL", "Poland"], ["UA", "Ukraine"]].map(([code, label]) => (
            <Choice key={code} checked={draft.countries.includes(code)} label={label} onChange={(checked) => setDraft((current) => ({ ...current, countries: toggleValue(current.countries, code, checked) }))} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <h2 className="font-semibold">Platforms and limits</h2>
        <p className="mt-2 text-sm text-[#748078]">Auto-apply limits are stored as policy caps; no connector may submit until its capability is verified.</p>
        <div className="mt-5 space-y-3">
          {sources.map(([platform, label]) => {
            const config = draft.platforms[platform];
            return (
              <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_8rem_8rem] sm:items-end" key={platform}>
                <Choice checked={config.selected} label={label} onChange={(selected) => setPlatform(setDraft, platform, { selected })} />
                <NumberInput disabled={!config.selected} label="Search limit" max={100} min={1} onChange={(searchLimit) => setPlatform(setDraft, platform, { searchLimit })} value={config.searchLimit} />
                <NumberInput disabled={!config.selected} label="Auto-apply cap" max={25} min={0} onChange={(autoApplyLimit) => setPlatform(setDraft, platform, { autoApplyLimit })} value={config.autoApplyLimit} />
              </div>
            );
          })}
        </div>
      </section>

      <label className="flex items-start gap-3 rounded-2xl border border-[#d9e2dc] bg-white p-5 text-sm">
        <input checked={draft.desiredEnabled} className="mt-1" onChange={(event) => setDraft((current) => ({ ...current, desiredEnabled: event.target.checked }))} type="checkbox" />
        <span><strong className="block">Enable when a discovery connector is ready</strong><span className="mt-1 block text-[#748078]">Until then, the schedule is safely stored in a waiting state.</span></span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button aria-busy={state === "saving"} className="inline-flex items-center gap-2 rounded-full bg-[#153f2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={state === "saving" || draft.countries.length === 0 || selectedPlatforms.length === 0} onClick={() => void save()} type="button">
          {state === "saving" ? <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" /> : null}
          {draft.id ? "Update schedule" : "Save schedule"}
        </button>
        {message ? <p aria-live="polite" className={`flex items-center gap-2 text-sm ${state === "error" ? "text-red-700" : "text-[#42634f]"}`}>{state === "saved" ? <CheckCircle2Icon className="size-4" /> : null}{message}</p> : null}
      </div>
    </div>
  );
}

function emptyDraft(): Draft {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw";
  return {
    id: null,
    name: "Morning job search",
    cadence: "daily",
    timezone,
    localTime: "08:00",
    dayOfWeek: 1,
    countries: ["PL", "UA"],
    desiredEnabled: true,
    platforms: Object.fromEntries(sources.map(([id]) => [id, { selected: id !== "linkedin", searchLimit: 25, autoApplyLimit: 0 }])) as Draft["platforms"],
  };
}

function draftFromSchedule(schedule: ScheduleView): Draft {
  const draft = emptyDraft();
  for (const platform of schedule.platforms) {
    draft.platforms[platform.platform] = { selected: true, searchLimit: platform.searchLimit, autoApplyLimit: platform.autoApplyLimit };
  }
  for (const [id] of sources) {
    if (!schedule.platforms.some((item) => item.platform === id)) draft.platforms[id].selected = false;
  }
  return { ...draft, id: schedule.id, name: schedule.name, cadence: schedule.cadence, timezone: schedule.timezone, localTime: schedule.localTime, dayOfWeek: schedule.dayOfWeek ?? 1, countries: schedule.targetCountries, desiredEnabled: schedule.desiredEnabled };
}

function setPlatform(setDraft: Dispatch<SetStateAction<Draft>>, platform: Platform, patch: Partial<Draft["platforms"][Platform]>) {
  setDraft((current) => ({
    ...current,
    platforms: {
      ...current.platforms,
      [platform]: { ...current.platforms[platform], ...patch },
    },
  }));
}

function TextInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="text-sm font-medium">{label}<input className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" onChange={(event) => onChange(event.target.value)} value={value} /></label>;
}

function NumberInput({ disabled, label, max, min, onChange, value }: { disabled: boolean; label: string; max: number; min: number; onChange: (value: number) => void; value: number }) {
  return <label className="text-xs font-medium text-[#5f7067]">{label}<input className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm disabled:bg-[#f3f5f2]" disabled={disabled} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} type="number" value={value} /></label>;
}

function Choice({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-2 text-sm"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span className="font-medium">{label}</span></label>;
}

function ActionButton({ disabled, icon: Icon, label, onClick }: { disabled: boolean; icon: typeof PlayIcon; label: string; onClick: () => void }) {
  return <button className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-50" disabled={disabled} onClick={onClick} type="button"><Icon className="size-3.5" />{label}</button>;
}

function toggleValue(current: string[], value: string, checked: boolean) {
  return checked ? [...new Set([...current, value])] : current.filter((item) => item !== value);
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
