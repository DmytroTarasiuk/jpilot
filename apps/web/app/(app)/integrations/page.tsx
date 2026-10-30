import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { listPlatformIntegrations } from "@jobpilot/db/integrations";
import { CircleDashedIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { updatePublicFeedConnection } from "./actions";

export default async function IntegrationsPage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  const platforms = await listPlatformIntegrations(identity);
  return (
    <div>
      <p className="text-sm font-medium text-[#5f7067]">Connections</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Job platforms</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">
        A platform is enabled only at the capability level its supported integration permits.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {platforms.map((platform) => (
          <article className="rounded-2xl border border-[#d9e2dc] bg-white p-5" key={platform.key}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{platform.name}</h2>
                <p className="mt-2 text-sm leading-6 text-[#748078]">{platform.description}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#f0f2ef] px-2.5 py-1 text-xs text-[#68736d]">
                <CircleDashedIcon className="size-3" /> {platform.status.replaceAll("_", " ")}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(platform.supportedCapabilities).map(([capability, supported]) => (
                <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${supported ? "bg-[#e9f2e9] text-[#315b45]" : "bg-[#f3f4f2] text-[#8a928d]"}`} key={capability}>
                  {capability}: {supported ? platform.availability === "available" ? "available" : "planned" : "unavailable"}
                </span>
              ))}
            </div>
            {platform.availability === "available" && (platform.key === "djinni" || platform.key === "dou") ? (
              <>
                <div className="mt-4 rounded-xl bg-[#f5f7f4] p-3 text-xs leading-5 text-[#647168]">
                  Connector health: <strong className={platform.connectorHealth === "healthy" ? "text-emerald-700" : "text-amber-700"}>{platform.connectorHealth}</strong>
                  {platform.lastFailureCode ? <span className="block">Last failure: {platform.lastFailureCode}</span> : null}
                  {platform.circuitOpenUntil ? <span className="block">Automatic retry after {platform.circuitOpenUntil.toISOString()}</span> : null}
                </div>
                <form action={updatePublicFeedConnection}>
                  <input name="intent" type="hidden" value={platform.status === "connected" ? "disconnect" : "connect"} />
                  <input name="platform" type="hidden" value={platform.key} />
                  <button className="mt-5 rounded-full border px-4 py-2 text-sm font-medium" type="submit">
                    {platform.status === "connected" ? "Disconnect" : "Connect RSS feed"}
                  </button>
                </form>
              </>
            ) : (
              <button className="mt-5 rounded-full border px-4 py-2 text-sm font-medium opacity-50" disabled type="button">
                Planned
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
