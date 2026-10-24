"use client";

import { LoaderCircleIcon, PlayIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunNowButton({ scheduleId }: { scheduleId: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function run() {
    if (!scheduleId) return;
    setState("loading");
    const response = await fetch("/api/search-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID(), scheduleId, lookbackDays: 1 }),
    });
    setState(response.ok ? "done" : "error");
    if (response.ok) router.refresh();
  }

  return (
    <div className="text-right">
      <button
        aria-busy={state === "loading"}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#153f2e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        disabled={!scheduleId || state === "loading"}
        onClick={() => void run()}
        title={scheduleId ? "Search the previous day now" : "Configure a schedule first"}
        type="button"
      >
        {state === "loading" ? <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" /> : <PlayIcon aria-hidden="true" className="size-4" />}
        Run search
      </button>
      {state === "done" ? <p aria-live="polite" className="mt-2 text-xs text-[#42634f]">Run queued.</p> : null}
      {state === "error" ? <p aria-live="polite" className="mt-2 text-xs text-red-700">Unable to queue the run.</p> : null}
    </div>
  );
}
