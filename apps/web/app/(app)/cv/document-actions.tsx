"use client";

import { CheckIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionState = "idle" | "activating" | "deleting" | "error";

export function CvDocumentActions({
  documentId,
  documentName,
  canActivate,
  deletionPending,
}: {
  documentId: string;
  documentName: string;
  canActivate: boolean;
  deletionPending: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const busy = state === "activating" || state === "deleting";

  async function activate() {
    setState("activating");
    setMessage(null);
    const response = await fetch(`/api/cv/documents/${documentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID() },
      body: JSON.stringify({ isActive: true }),
    });
    if (!response.ok) {
      setState("error");
      setMessage(await responseMessage(response));
      return;
    }
    setState("idle");
    router.refresh();
  }

  async function remove() {
    if (
      !deletionPending &&
      !window.confirm(
        `Delete “${documentName}”? The private file and extracted CV data will be permanently removed.`,
      )
    ) {
      return;
    }

    setState("deleting");
    setMessage(null);
    const response = await fetch(`/api/cv/documents/${documentId}`, {
      method: "DELETE",
      headers: { "x-request-id": crypto.randomUUID() },
    });
    if (!response.ok) {
      setState("error");
      setMessage(await responseMessage(response));
      router.refresh();
      return;
    }
    setState("idle");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {canActivate ? (
          <button
            className="inline-flex items-center gap-1.5 rounded-full border border-[#9db3a5] px-3 py-1.5 text-xs font-semibold text-[#27563f] transition hover:bg-[#edf4ef] disabled:opacity-50"
            disabled={busy}
            onClick={() => void activate()}
            type="button"
          >
            {state === "activating" ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
            Use for matching
          </button>
        ) : null}
        <button
          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => void remove()}
          type="button"
        >
          {state === "deleting" ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
          {deletionPending ? "Retry cleanup" : "Delete"}
        </button>
      </div>
      {message ? <p aria-live="polite" className="max-w-sm text-xs text-red-700">{message}</p> : null}
    </div>
  );
}

async function responseMessage(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? `Request failed with status ${response.status}.`;
}
