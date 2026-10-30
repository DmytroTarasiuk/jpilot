"use client";

import { useState } from "react";

interface PendingErasure {
  requestId: string;
  token: string;
  expiresAt: string;
}

export function ErasureControl() {
  const [pending, setPending] = useState<PendingErasure | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/privacy/erasure", { method: "POST" });
      const payload = (await response.json()) as PendingErasure & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to prepare deletion.");
      setPending(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to prepare deletion.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/privacy/erasure", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          privacyRequestId: pending.requestId,
          confirmationToken: pending.token,
          confirmation,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Deletion failed.");
      setMessage("Your JobPilot workspace data was deleted. You can now sign out.");
      setPending(null);
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deletion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      {pending ? (
        <div className="space-y-3">
          <p className="text-sm text-red-800">
            This request expires at {new Date(pending.expiresAt).toLocaleTimeString("en-GB")}.
            Enter <strong>DELETE MY DATA</strong> to remove this workspace’s user-owned data and private CV objects.
          </p>
          <label className="block text-sm font-medium text-red-950" htmlFor="erasure-confirmation">
            Confirmation phrase
          </label>
          <input
            autoComplete="off"
            className="w-full rounded-xl border border-red-300 bg-white px-3 py-2.5"
            id="erasure-confirmation"
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || confirmation !== "DELETE MY DATA"}
              onClick={confirm}
              type="button"
            >
              Permanently delete my data
            </button>
            <button className="text-sm font-semibold" disabled={busy} onClick={() => setPending(null)} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
          disabled={busy}
          onClick={begin}
          type="button"
        >
          {busy ? "Preparing…" : "Start deletion request"}
        </button>
      )}
      {message ? <p aria-live="polite" className="mt-3 text-sm text-red-800">{message}</p> : null}
    </div>
  );
}
