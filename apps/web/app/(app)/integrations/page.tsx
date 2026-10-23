import { CircleDashedIcon } from "lucide-react";

const platforms = [
  ["LinkedIn", "Discovery depends on approved access; external applications stay manual."],
  ["Just Join IT", "Discovery adapter planned; submission capability must be verified."],
  ["No Fluff Jobs", "Discovery adapter planned; submission capability must be verified."],
  ["DOU", "Discovery adapter planned; external flows become manual tasks."],
  ["Djinni", "Discovery and first-party application capabilities require verification."],
] as const;

export default function IntegrationsPage() {
  return (
    <div>
      <p className="text-sm font-medium text-[#5f7067]">Connections</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Job platforms</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">
        A platform is enabled only at the capability level its supported integration permits.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {platforms.map(([name, description]) => (
          <article className="rounded-2xl border border-[#d9e2dc] bg-white p-5" key={name}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{name}</h2>
                <p className="mt-2 text-sm leading-6 text-[#748078]">{description}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#f0f2ef] px-2.5 py-1 text-xs text-[#68736d]">
                <CircleDashedIcon className="size-3" /> Planned
              </span>
            </div>
            <button className="mt-5 rounded-full border px-4 py-2 text-sm font-medium opacity-50" disabled type="button">
              Connect
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
