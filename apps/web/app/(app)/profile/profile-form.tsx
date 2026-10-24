"use client";

import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ProfileFormValue {
  displayName: string;
  headline: string;
  targetCountries: string[];
  targetTitles: string[];
  workModes: string[];
  languages: string[];
  excludedCompanies: string[];
  salaryMin: number | null;
  salaryCurrency: "PLN" | "EUR" | "USD" | "UAH";
  salaryPeriod: "monthly" | "annual";
}

const countryOptions = [["PL", "Poland"], ["UA", "Ukraine"]] as const;
const modeOptions = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]] as const;

export function ProfileForm({
  initial,
  submitUrl = "/api/profile",
  method = "PUT",
  submitLabel = "Save profile",
}: {
  initial: ProfileFormValue;
  submitUrl?: string;
  method?: "POST" | "PUT";
  submitLabel?: string;
}) {
  const router = useRouter();
  const [countries, setCountries] = useState(initial.targetCountries);
  const [workModes, setWorkModes] = useState(initial.workModes);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(form: HTMLFormElement) {
    setState("saving");
    setMessage("");
    const values = new FormData(form);
    const salary = String(values.get("salaryMin") ?? "").trim();
    const payload = {
      displayName: String(values.get("displayName") ?? "").trim(),
      headline: String(values.get("headline") ?? "").trim(),
      targetCountries: countries,
      targetTitles: splitList(String(values.get("targetTitles") ?? "")),
      workModes,
      languages: splitList(String(values.get("languages") ?? "")),
      excludedCompanies: splitList(String(values.get("excludedCompanies") ?? "")),
      salaryMin: salary ? Number(salary) : null,
      salaryCurrency: String(values.get("salaryCurrency") ?? "PLN"),
      salaryPeriod: String(values.get("salaryPeriod") ?? "monthly"),
    };
    try {
      const response = await fetch(submitUrl, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "The profile could not be saved.");
      setState("saved");
      setMessage("Profile saved.");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The profile could not be saved.");
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <h2 className="font-semibold">Identity and direction</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field defaultValue={initial.displayName} label="Display name" name="displayName" />
          <Field defaultValue={initial.headline} label="Professional headline" name="headline" />
          <Field
            className="sm:col-span-2"
            defaultValue={initial.targetTitles.join("\n")}
            label="Target job titles"
            multiline
            name="targetTitles"
            note="One per line or comma-separated"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <h2 className="font-semibold">Markets and work mode</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {countryOptions.map(([value, label]) => (
            <Choice
              checked={countries.includes(value)}
              key={value}
              label={label}
              onChange={(checked) =>
                setCountries((current) => toggleValue(current, value, checked))
              }
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {modeOptions.map(([value, label]) => (
            <Choice
              checked={workModes.includes(value)}
              key={value}
              label={label}
              onChange={(checked) =>
                setWorkModes((current) => toggleValue(current, value, checked))
              }
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#d9e2dc] bg-white p-6">
        <h2 className="font-semibold">Preferences</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            defaultValue={initial.languages.join(", ")}
            label="Languages"
            name="languages"
            note="Comma-separated"
          />
          <Field
            defaultValue={initial.excludedCompanies.join(", ")}
            label="Excluded companies"
            name="excludedCompanies"
            note="Comma-separated"
          />
          <label className="text-sm font-medium">
            Minimum salary
            <input
              className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5"
              defaultValue={initial.salaryMin ?? ""}
              min="0"
              name="salaryMin"
              step="1"
              type="number"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium">
              Currency
              <select className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" defaultValue={initial.salaryCurrency} name="salaryCurrency">
                {(["PLN", "EUR", "USD", "UAH"] as const).map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Period
              <select className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5" defaultValue={initial.salaryPeriod} name="salaryPeriod">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          aria-busy={state === "saving"}
          className="inline-flex items-center gap-2 rounded-full bg-[#153f2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={state === "saving" || countries.length === 0 || workModes.length === 0}
          type="submit"
        >
          {state === "saving" ? <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" /> : null}
          {submitLabel}
        </button>
        {message ? (
          <p aria-live="polite" className={`flex items-center gap-2 text-sm ${state === "error" ? "text-red-700" : "text-[#42634f]"}`}>
            {state === "saved" ? <CheckCircle2Icon className="size-4" /> : null}
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  className = "",
  defaultValue,
  label,
  multiline = false,
  name,
  note,
}: {
  className?: string;
  defaultValue: string;
  label: string;
  multiline?: boolean;
  name: string;
  note?: string;
}) {
  const controlClass = "mt-2 w-full rounded-xl border bg-white px-3 py-2.5";
  return (
    <label className={`text-sm font-medium ${className}`}>
      {label}
      {multiline ? (
        <textarea className={controlClass} defaultValue={defaultValue} name={name} rows={3} />
      ) : (
        <input className={controlClass} defaultValue={defaultValue} name={name} />
      )}
      {note ? <span className="mt-1 block text-xs font-normal text-[#748078]">{note}</span> : null}
    </label>
  );
}

function Choice({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

function toggleValue(current: string[], value: string, checked: boolean) {
  return checked ? [...new Set([...current, value])] : current.filter((item) => item !== value);
}

function splitList(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}
